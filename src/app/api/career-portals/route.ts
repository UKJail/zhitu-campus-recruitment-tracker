import portalData from "@/data/career-portals.json";

export const dynamic = "force-static";

export async function GET() {
  return Response.json(portalData, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
