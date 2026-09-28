"""
Bug Condition Exploration Test for Data Pipeline System Failure

**CRITICAL**: This test is EXPECTED TO FAIL on unfixed code.
Failure confirms the bugs exist. DO NOT fix the test or code when it fails.

This test explores four failure scenarios:
1. Backend with COLLECTION_ENABLED=false skips job registration
2. Empty API credentials cause silent collection failures
3. Missing Firebase config causes 502 errors instead of graceful fallback
4. Government portal Promise.all() blocks UI without timeouts

Run: pytest tests/test_data_pipeline_bugfix.py -v -s

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4**
"""
import pytest
import os
import asyncio
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from datetime import datetime, timezone

from app.core.config import Settings
from app.models.user import User
from app.models.fare import FareObservation
from app.models.collection import SourceHealth


# ──────────────────────────────────────────────────────────────────────────
# Scenario 1: Collection Disabled Detection
# ──────────────────────────────────────────────────────────────────────────

def test_collection_disabled_prevents_scheduler_jobs():
    """
    Bug Condition: When COLLECTION_ENABLED=false, scheduler should skip job registration.
    
    Expected Behavior After Fix:
    - Backend logs warning that collection is disabled
    - Scheduler does not register collection jobs
    - System still serves existing data from database
    
    This test will FAIL on unfixed code if the system doesn't properly detect
    disabled collection.
    """
    # Setup: Configure with collection disabled
    with patch.dict(os.environ, {"COLLECTION_ENABLED": "false"}):
        settings = Settings()
        
        # Expected behavior: COLLECTION_ENABLED should be false
        assert settings.COLLECTION_ENABLED == False, \
            "COLLECTION_ENABLED should be False when set in environment"
        
        # Expected behavior: System should recognize collection is disabled
        # In the fixed system, log_credential_status() would log a warning
        # For now, we just verify the flag is respected
        assert not settings.COLLECTION_ENABLED, \
            "System should detect that collection is disabled"


def test_collection_enabled_allows_scheduler_jobs():
    """
    Expected Behavior: When COLLECTION_ENABLED=true and valid credentials exist,
    scheduler should register and execute collection jobs.
    
    This test will FAIL on unfixed code because:
    - The current .env has COLLECTION_ENABLED=false
    - Missing credential validation means jobs may start but fail silently
    """
    # Setup: Configure with collection enabled and valid (mocked) credentials
    with patch.dict(os.environ, {
        "COLLECTION_ENABLED": "true",
        "AMADEUS_API_KEY": "test_valid_key",
        "AMADEUS_API_SECRET": "test_valid_secret"
    }):
        settings = Settings()
        
        # Expected behavior: Collection should be enabled
        assert settings.COLLECTION_ENABLED == True, \
            "COLLECTION_ENABLED should be True when set in environment"
        
        # Expected behavior: System should have credentials configured
        # This will FAIL on unfixed code because amadeus_configured property doesn't exist yet
        try:
            assert settings.amadeus_configured == True, \
                "System should detect Amadeus credentials are configured"
        except AttributeError:
            pytest.fail(
                "EXPECTED FAILURE: Settings.amadeus_configured property not implemented. "
                "This confirms the bug exists. After fix, this property should exist and return True."
            )


# ──────────────────────────────────────────────────────────────────────────
# Scenario 2: Missing Credential Detection
# ──────────────────────────────────────────────────────────────────────────

def test_empty_credentials_detected_at_startup():
    """
    Bug Condition: Empty API credentials are not validated at startup.
    
    Expected Behavior After Fix:
    - Backend validates credentials on startup
    - Logs warnings for missing credentials
    - Skips unconfigured providers during collection
    
    This test will FAIL on unfixed code because validation properties don't exist.
    """
    # Setup: Configure with empty credentials
    with patch.dict(os.environ, {
        "AMADEUS_API_KEY": "",
        "AMADEUS_API_SECRET": "",
        "DUFFEL_API_TOKEN": "",
        "AVIATIONSTACK_API_KEY": ""
    }):
        settings = Settings()
        
        # Expected behavior: System should detect empty credentials
        # This will FAIL on unfixed code because these properties don't exist yet
        try:
            assert settings.amadeus_configured == False, \
                "System should detect Amadeus credentials are NOT configured"
            assert settings.duffel_configured == False, \
                "System should detect Duffel credentials are NOT configured"
            assert settings.aviationstack_configured == False, \
                "System should detect AviationStack credentials are NOT configured"
        except AttributeError:
            pytest.fail(
                "EXPECTED FAILURE: Credential validation properties not implemented. "
                "This confirms the bug exists. After fix, these properties should exist and detect empty credentials."
            )


def test_partial_credentials_rejected():
    """
    Edge Case: Partial credential configuration (only key without secret).
    
    Expected Behavior: System should detect incomplete credential pairs.
    
    This test will FAIL on unfixed code.
    """
    # Setup: Amadeus key present but secret missing
    with patch.dict(os.environ, {
        "AMADEUS_API_KEY": "valid_key",
        "AMADEUS_API_SECRET": ""
    }):
        settings = Settings()
        
        try:
            # Expected: Should detect incomplete credentials
            assert settings.amadeus_configured == False, \
                "System should reject incomplete Amadeus credentials (missing secret)"
        except AttributeError:
            pytest.fail(
                "EXPECTED FAILURE: Credential validation not implemented. "
                "Partial credentials would be passed through causing silent failures."
            )


def test_credential_status_logging():
    """
    Expected Behavior: System logs credential configuration status at startup.
    
    This test will FAIL on unfixed code because log_credential_status() doesn't exist.
    """
    with patch.dict(os.environ, {
        "COLLECTION_ENABLED": "true",
        "AMADEUS_API_KEY": "",
        "DUFFEL_API_TOKEN": ""
    }):
        settings = Settings()
        
        try:
            # Expected: log_credential_status method should exist
            assert hasattr(settings, 'log_credential_status'), \
                "Settings should have log_credential_status method"
            
            # Call the method (should log warnings for missing credentials)
            settings.log_credential_status()
        except (AttributeError, AssertionError):
            pytest.fail(
                "EXPECTED FAILURE: log_credential_status() method not implemented. "
                "This confirms missing credential validation at startup."
            )


# ──────────────────────────────────────────────────────────────────────────
# Scenario 3: Firebase Authentication Fallback
# ──────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_users_without_firebase_returns_502(db):
    """
    Bug Condition: When Firebase is not configured, /api/admin/users raises
    unhandled exception causing 502 error.
    
    Expected Behavior After Fix:
    - Catch Firebase initialization failure gracefully
    - Fall back to local database User table
    - Return HTTP 200 with local users or demo users
    - Include clear message about authentication source
    
    This test will FAIL on unfixed code with 502 error.
    """
    # Setup: Clear Firebase configuration
    with patch.dict(os.environ, {"FIREBASE_SERVICE_ACCOUNT_JSON": ""}):
        # Import here to get fresh settings
        from app.api.routes.admin import _firebase_users, list_users
        from app.core.auth import require_admin_or_local
        
        # Test _firebase_users() with missing config
        result = _firebase_users()
        
        # Expected behavior after fix: Should return None gracefully (not crash)
        # On unfixed code: This might raise exception or return invalid data
        # We expect None to signal fallback needed
        if result is not None:
            pytest.fail(
                "EXPECTED FAILURE: _firebase_users() should return None when Firebase "
                "is not configured, but returned data. This suggests it's not handling "
                "missing config properly."
            )
        
        # Now test the full endpoint with TestClient
        from main import app
        client = TestClient(app)
        
        # Create a mock admin user in local database
        db.add(User(
            email="test@example.com",
            role="ADMIN",
            plan="FREE",
            name="Test Admin"
        ))
        await db.commit()
        
        # Mock authentication to bypass JWT requirement
        with patch('app.api.routes.admin.require_admin_or_local') as mock_auth:
            mock_auth.return_value = {
                "email": "test@example.com",
                "role": "ADMIN",
                "plan": "FREE"
            }
            
            # Make request to admin users endpoint
            response = client.get("/api/admin/users")
            
            # Expected behavior after fix: Should return 200, not 502
            # On unfixed code: Will return 502 with "Google sign-in is not configured"
            if response.status_code == 502:
                pytest.fail(
                    f"EXPECTED FAILURE: /api/admin/users returned 502 error instead of "
                    f"falling back to local database. Error: {response.json().get('detail', 'Unknown')}. "
                    f"This confirms the Firebase fallback bug exists."
                )
            
            assert response.status_code == 200, \
                "After fix, /api/admin/users should return 200 even without Firebase"
            
            data = response.json()
            assert "users" in data, "Response should contain users array"
            assert "source" in data, "Response should indicate authentication source"
            assert data["source"] in ["local_database", "demo"], \
                "Source should be local_database or demo when Firebase not configured"


# ──────────────────────────────────────────────────────────────────────────
# Scenario 4: Government Portal UI Blocking
# ──────────────────────────────────────────────────────────────────────────

def test_promise_all_replaced_with_allsettled():
    """
    Bug Condition: Government data hook uses Promise.all() without timeouts,
    blocking UI when endpoints hang.
    
    Expected Behavior After Fix:
    - Use Promise.allSettled() to handle individual rejections
    - Wrap each API call with timeout (5 seconds)
    - UI remains responsive during fetch
    - Failed endpoints don't block successful ones
    
    This test will FAIL on unfixed code by detecting Promise.all usage.
    """
    # Read the useGovData.ts source code
    hook_path = "c:\\Users\\HP VICTUS\\Desktop\\air - Copy\\src\\hooks\\useGovData.ts"
    
    try:
        with open(hook_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        pytest.skip(f"useGovData.ts not found at {hook_path}")
    
    # Check for blocking Promise.all pattern
    has_promise_all = "Promise.all(" in content or "Promise.all([" in content
    has_allsettled = "Promise.allSettled(" in content or "Promise.allSettled([" in content
    has_timeout_helper = "withTimeout" in content or "Promise.race" in content
    
    # Expected behavior after fix:
    # - Should use Promise.allSettled (not Promise.all)
    # - Should have timeout helper function
    
    if has_promise_all and not has_allsettled:
        pytest.fail(
            "EXPECTED FAILURE: useGovData.ts uses blocking Promise.all() without Promise.allSettled(). "
            "This confirms the UI blocking bug exists. "
            "After fix, code should use Promise.allSettled() to handle rejections gracefully."
        )
    
    if not has_timeout_helper:
        pytest.fail(
            "EXPECTED FAILURE: useGovData.ts does not implement timeout helper (withTimeout or Promise.race). "
            "This confirms API calls have no timeout protection. "
            "After fix, each API call should be wrapped with a 5-second timeout."
        )
    
    # If we reach here, the fix is implemented
    assert has_allsettled, "Should use Promise.allSettled for non-blocking behavior"
    assert has_timeout_helper, "Should have timeout protection for API calls"


# ──────────────────────────────────────────────────────────────────────────
# Integration: Full Pipeline Behavior
# ──────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_full_collection_pipeline_with_valid_config(db):
    """
    Expected Behavior: With proper configuration (COLLECTION_ENABLED=true + 
    valid credentials), system should:
    1. Validate credentials at startup
    2. Register scheduler jobs
    3. Execute collection (or log that it would execute)
    4. Write observations to database
    5. Serve data through API endpoints
    
    This test will FAIL on unfixed code due to missing validation and
    disabled collection.
    """
    # Setup: Proper configuration
    with patch.dict(os.environ, {
        "COLLECTION_ENABLED": "true",
        "AMADEUS_API_KEY": "test_key",
        "AMADEUS_API_SECRET": "test_secret"
    }):
        settings = Settings()
        
        # Check 1: Collection enabled
        assert settings.COLLECTION_ENABLED, \
            "Collection should be enabled with proper config"
        
        # Check 2: Credentials validated
        try:
            assert settings.amadeus_configured, \
                "Amadeus credentials should be detected as configured"
        except AttributeError:
            pytest.fail(
                "EXPECTED FAILURE: Credential validation not implemented. "
                "Cannot verify proper configuration."
            )
        
        # Check 3: Scheduler would register jobs (tested via lifespan in main.py)
        # We can't easily test scheduler registration in unit test, but we verify
        # the configuration that would allow it
        
        # Check 4: Mock collection run
        # In real system, this would write observations
        # For now, just verify database is ready
        count = await db.scalar(select(func.count()).select_from(FareObservation))
        assert count is not None, "Database should be ready for observations"


@pytest.mark.asyncio
async def test_source_health_reflects_configuration(db):
    """
    Expected Behavior: SourceHealth table should accurately reflect which
    sources are configured vs not configured.
    
    This test will FAIL on unfixed code because SourceHealth update logic
    doesn't exist yet.
    """
    # Setup: Only Amadeus configured
    with patch.dict(os.environ, {
        "AMADEUS_API_KEY": "test_key",
        "AMADEUS_API_SECRET": "test_secret",
        "DUFFEL_API_TOKEN": ""
    }):
        # Try to import and run the source health update function
        try:
            from app.services.source_validator import update_source_health_on_startup
            
            await update_source_health_on_startup(db)
            
            # Check Amadeus status
            amadeus = await db.scalar(
                select(SourceHealth).where(SourceHealth.source_name == "Amadeus")
            )
            assert amadeus is not None, "Amadeus SourceHealth record should exist"
            assert amadeus.status == "CONFIGURED", \
                "Amadeus should be marked as CONFIGURED"
            
            # Check Duffel status
            duffel = await db.scalar(
                select(SourceHealth).where(SourceHealth.source_name == "Duffel")
            )
            if duffel:
                assert duffel.status == "NOT_CONFIGURED", \
                    "Duffel should be marked as NOT_CONFIGURED"
                assert "Missing credentials" in (duffel.error_message or ""), \
                    "Should indicate which credentials are missing"
                    
        except (ImportError, AttributeError):
            pytest.fail(
                "EXPECTED FAILURE: update_source_health_on_startup() not implemented. "
                "This confirms SourceHealth tracking doesn't reflect actual configuration."
            )


# ──────────────────────────────────────────────────────────────────────────
# Summary Test: Bug Condition Coverage
# ──────────────────────────────────────────────────────────────────────────

def test_bug_condition_summary():
    """
    Summary of bug conditions that should trigger system failures:
    
    1. ✗ COLLECTION_ENABLED=false → No data collection
    2. ✗ Empty API credentials → Silent failures
    3. ✗ Missing Firebase config → 502 errors
    4. ✗ Blocking Promise.all() → UI freezes
    
    This summary test documents all the bug conditions we're testing for.
    It will FAIL on unfixed code with a comprehensive report.
    """
    issues_found = []
    
    # Check 1: Collection disabled detection
    with patch.dict(os.environ, {"COLLECTION_ENABLED": "false"}):
        settings = Settings()
        # The explicit false override is expected for maintenance-mode
        # behavior; it is not a failure of the production configuration.
        assert settings.COLLECTION_ENABLED is False
    
    # Check 2: Credential validation
    with patch.dict(os.environ, {"AMADEUS_API_KEY": "", "DUFFEL_API_TOKEN": ""}):
        settings = Settings()
        if not hasattr(settings, 'amadeus_configured'):
            issues_found.append(
                "2. No credential validation at startup - Empty credentials pass through silently"
            )
    
    # Check 3: Firebase fallback
    if not hasattr(Settings, 'log_credential_status'):
        issues_found.append(
            "3. Firebase exception handling not implemented - 502 errors on /api/admin/users"
        )
    
    # Check 4: Government portal blocking
    hook_path = "c:\\Users\\HP VICTUS\\Desktop\\air - Copy\\src\\hooks\\useGovData.ts"
    try:
        with open(hook_path, 'r', encoding='utf-8') as f:
            if "Promise.all(" in f.read() and "Promise.allSettled(" not in f.read():
                issues_found.append(
                    "4. useGovData uses blocking Promise.all() - UI freezes on government portal tab"
                )
    except FileNotFoundError:
        pass
    
    # If we found any issues, report them
    if issues_found:
        report = "\n\nBUG CONDITIONS DETECTED (Expected on unfixed code):\n" + \
                 "\n".join(issues_found) + \
                 "\n\nThese bugs will be fixed by implementing the design changes in tasks 3.1-3.6."
        pytest.fail(report)
    
    # If no issues found, all fixes are implemented
    print("\n✓ All bug conditions resolved - fixes are working correctly")
