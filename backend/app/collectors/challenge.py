"""
Airline adapters that immediately return CHALLENGE_DETECTED.

All five major Indian carriers deploy bot protection that blocks automated
access from standard HTTP clients. This is documented honestly — these adapters
never fabricate fares.

To activate a carrier, replace with a real NDC/API adapter and configure
the appropriate environment variables.
"""
from app.collectors.base import FareSourceAdapter, CollectionResult


class IndiGoAdapter(FareSourceAdapter):
    source_id = "indigo"
    source_name = "IndiGo (goindigo.in)"
    source_type = "AIRLINE_DIRECT"
    requires_credentials = True
    credential_env_vars = ["INDIGO_API_KEY", "INDIGO_NDC_ENDPOINT"]

    async def collect(self, route, travel_date, advance_days, collection_run_id) -> CollectionResult:
        if not self.is_configured():
            return self.challenge_result(
                route, travel_date, advance_days,
                "Cloudflare Bot Management (Enterprise). JS fingerprinting + TLS inspection "
                "blocks headless clients. Configure INDIGO_API_KEY + INDIGO_NDC_ENDPOINT "
                "for authorized NDC access.",
            )
        # Authorized NDC path — implement when credentials are provided
        return self.challenge_result(
            route, travel_date, advance_days,
            "NDC endpoint configured but collection not yet implemented. "
            "Implement NDC request in IndiGoAdapter.collect().",
        )


class AirIndiaAdapter(FareSourceAdapter):
    source_id = "airindia"
    source_name = "Air India (airindia.com)"
    source_type = "AIRLINE_DIRECT"
    requires_credentials = True
    credential_env_vars = ["AIRINDIA_API_KEY", "AIRINDIA_NDC_ENDPOINT"]

    async def collect(self, route, travel_date, advance_days, collection_run_id) -> CollectionResult:
        if not self.is_configured():
            return self.challenge_result(
                route, travel_date, advance_days,
                "Imperva/Incapsula anti-scraping middleware. Akamai bot detection. "
                "Configure AIRINDIA_API_KEY + AIRINDIA_NDC_ENDPOINT for authorized access.",
            )
        return self.challenge_result(route, travel_date, advance_days, "NDC not yet implemented.")


class AkasaAdapter(FareSourceAdapter):
    source_id = "akasa"
    source_name = "Akasa Air (akasaair.com)"
    source_type = "AIRLINE_DIRECT"
    requires_credentials = True
    credential_env_vars = ["AKASA_API_KEY", "AKASA_NDC_ENDPOINT"]

    async def collect(self, route, travel_date, advance_days, collection_run_id) -> CollectionResult:
        if not self.is_configured():
            return self.challenge_result(
                route, travel_date, advance_days,
                "JS-rendered SPA + reCAPTCHA v3. Requires authorized API/NDC access. "
                "Configure AKASA_API_KEY + AKASA_NDC_ENDPOINT.",
            )
        return self.challenge_result(route, travel_date, advance_days, "NDC not yet implemented.")


class SpiceJetAdapter(FareSourceAdapter):
    source_id = "spicejet"
    source_name = "SpiceJet (spicejet.com)"
    source_type = "AIRLINE_DIRECT"
    requires_credentials = True
    credential_env_vars = ["SPICEJET_API_KEY", "SPICEJET_NDC_ENDPOINT"]

    async def collect(self, route, travel_date, advance_days, collection_run_id) -> CollectionResult:
        if not self.is_configured():
            return self.challenge_result(
                route, travel_date, advance_days,
                "Cloudflare Enterprise + browser fingerprinting. "
                "Configure SPICEJET_API_KEY + SPICEJET_NDC_ENDPOINT.",
            )
        return self.challenge_result(route, travel_date, advance_days, "NDC not yet implemented.")


class AirIndiaExpressAdapter(FareSourceAdapter):
    source_id = "airindia-express"
    source_name = "Air India Express"
    source_type = "AIRLINE_DIRECT"
    requires_credentials = True
    credential_env_vars = ["AIRINDIA_API_KEY", "AIRINDIA_NDC_ENDPOINT"]

    async def collect(self, route, travel_date, advance_days, collection_run_id) -> CollectionResult:
        return self.challenge_result(
            route, travel_date, advance_days,
            "Shared Akamai/Cloudflare CDN with Air India. Same NDC credentials apply.",
        )
