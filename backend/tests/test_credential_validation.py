"""
Test credential validation properties and startup logging.

Validates Requirements: 5.1, 5.2, 5.3, 5.4
"""
import pytest
from unittest.mock import patch, MagicMock
from app.core.config import Settings


def test_amadeus_configured_when_both_credentials_present():
    """Test amadeus_configured property returns True when both key and secret are non-empty."""
    settings = Settings(
        AMADEUS_API_KEY="test_key_123",
        AMADEUS_API_SECRET="test_secret_456"
    )
    assert settings.amadeus_configured is True


def test_amadeus_not_configured_when_key_missing():
    """Test amadeus_configured property returns False when key is empty."""
    settings = Settings(
        AMADEUS_API_KEY="",
        AMADEUS_API_SECRET="test_secret_456"
    )
    assert settings.amadeus_configured is False


def test_amadeus_not_configured_when_secret_missing():
    """Test amadeus_configured property returns False when secret is empty."""
    settings = Settings(
        AMADEUS_API_KEY="test_key_123",
        AMADEUS_API_SECRET=""
    )
    assert settings.amadeus_configured is False


def test_amadeus_not_configured_when_both_missing():
    """Test amadeus_configured property returns False when both are empty."""
    settings = Settings(
        AMADEUS_API_KEY="",
        AMADEUS_API_SECRET=""
    )
    assert settings.amadeus_configured is False


def test_duffel_configured_when_token_present():
    """Test duffel_configured property returns True when token is non-empty."""
    settings = Settings(DUFFEL_API_TOKEN="duffel_test_xyz789")
    assert settings.duffel_configured is True


def test_duffel_not_configured_when_token_missing():
    """Test duffel_configured property returns False when token is empty."""
    settings = Settings(DUFFEL_API_TOKEN="")
    assert settings.duffel_configured is False


def test_aviationstack_configured_when_key_present():
    """Test aviationstack_configured property returns True when key is non-empty."""
    settings = Settings(AVIATIONSTACK_API_KEY="avstack_key_abc")
    assert settings.aviationstack_configured is True


def test_aviationstack_not_configured_when_key_missing():
    """Test aviationstack_configured property returns False when key is empty."""
    settings = Settings(AVIATIONSTACK_API_KEY="")
    assert settings.aviationstack_configured is False


def test_log_credential_status_when_collection_disabled():
    """Test log_credential_status warns when collection is disabled."""
    settings = Settings(COLLECTION_ENABLED=False)
    
    with patch('logging.getLogger') as mock_get_logger:
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger
        
        settings.log_credential_status()
        
        # Should log collection disabled status
        mock_logger.info.assert_called_once()
        assert "Collection enabled: False" in str(mock_logger.info.call_args)
        
        # Should log warning about collection being disabled
        mock_logger.warning.assert_called_once()
        assert "DISABLED" in str(mock_logger.warning.call_args)


def test_log_credential_status_with_all_credentials_configured():
    """Test log_credential_status reports all configured sources correctly."""
    settings = Settings(
        COLLECTION_ENABLED=True,
        AMADEUS_API_KEY="test_key",
        AMADEUS_API_SECRET="test_secret",
        DUFFEL_API_TOKEN="duffel_test_token",
        AVIATIONSTACK_API_KEY="avstack_key"
    )
    
    with patch('logging.getLogger') as mock_get_logger:
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger
        
        settings.log_credential_status()
        
        # Should log info for each configured source
        info_calls = [str(call) for call in mock_logger.info.call_args_list]
        
        # Check that all providers are reported as configured
        assert any("Amadeus API credentials configured" in call for call in info_calls)
        assert any("Duffel API token configured" in call for call in info_calls)
        assert any("AviationStack API key configured" in call for call in info_calls)
        assert any("Total configured sources: 3" in call for call in info_calls)


def test_log_credential_status_with_no_credentials_configured():
    """Test log_credential_status errors when no credentials are configured."""
    settings = Settings(
        COLLECTION_ENABLED=True,
        AMADEUS_API_KEY="",
        AMADEUS_API_SECRET="",
        DUFFEL_API_TOKEN="",
        AVIATIONSTACK_API_KEY=""
    )
    
    with patch('logging.getLogger') as mock_get_logger:
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger
        
        settings.log_credential_status()
        
        # Should log warnings for each missing credential
        warning_calls = [str(call) for call in mock_logger.warning.call_args_list]
        assert any("Amadeus API credentials NOT configured" in call for call in warning_calls)
        assert any("Duffel API token NOT configured" in call for call in warning_calls)
        
        # Should log error about no credentials configured
        mock_logger.error.assert_called_once()
        assert "NO EXTERNAL API CREDENTIALS CONFIGURED" in str(mock_logger.error.call_args)


def test_log_credential_status_with_partial_credentials():
    """Test log_credential_status with some credentials configured and others missing."""
    settings = Settings(
        COLLECTION_ENABLED=True,
        AMADEUS_API_KEY="test_key",
        AMADEUS_API_SECRET="test_secret",
        DUFFEL_API_TOKEN="",
        AVIATIONSTACK_API_KEY=""
    )
    
    with patch('logging.getLogger') as mock_get_logger:
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger
        
        settings.log_credential_status()
        
        info_calls = [str(call) for call in mock_logger.info.call_args_list]
        warning_calls = [str(call) for call in mock_logger.warning.call_args_list]
        
        # Amadeus should be configured
        assert any("Amadeus API credentials configured" in call for call in info_calls)
        
        # Duffel should be missing
        assert any("Duffel API token NOT configured" in call for call in warning_calls)
        
        # Should report 1 configured source (Amadeus only; AviationStack is optional)
        assert any("Total configured sources: 1" in call for call in info_calls)
