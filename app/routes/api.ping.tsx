/**
 * Keep-Alive Ping Endpoint
 * Route: GET /api/ping
 *
 * Simple health-check endpoint to prevent Vercel cold starts.
 * Hit via external cron every 5 minutes.
 */

import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    return Response.json({
        ok: true,
        timestamp: new Date().toISOString(),
    });
};
