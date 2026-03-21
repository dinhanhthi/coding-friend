Plan the implementation of a rate limiter middleware for the API client. It should limit requests to 100 per minute per endpoint, with configurable limits.

Context: This is a client-side rate limiter (not server middleware). Use pure TypeScript with no external libraries. Use a sliding window algorithm. Store counts in memory. Make the limit configurable per-endpoint. Include a retry-after header in the response when rate limited. Do NOT ask clarifying questions — proceed directly with creating the plan.
