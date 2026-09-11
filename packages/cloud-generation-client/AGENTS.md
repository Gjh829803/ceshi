# Cloud generation client maintenance

Own the existing generation-service transport, request polling/reconciliation and
artifact transfer helpers. Preserve exact request identity and authentication
semantics. Do not print credentials or retry an uncertain submission with a new
identity. Test transport with mocks; a client change does not authorize real jobs.
