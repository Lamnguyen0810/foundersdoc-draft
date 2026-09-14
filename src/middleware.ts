import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets. The API route IS matched on purpose: an
     * unauthenticated request must not be able to spend quota.
     *
     * THE EXTENSION LIST MATTERS MORE THAN IT LOOKS. Anything not excluded here
     * runs the auth check, and a file in public/ that fails it is answered with
     * a redirect to /login — so a stylesheet or script comes back as an HTML
     * page and the browser silently ignores it. The images were excluded from
     * the start; scripts and fonts were not, which is how /fd-track.js ended up
     * returning a 307 to the login screen and never running at all.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|js|mjs|css|map|txt|xml|json|webmanifest|woff|woff2|ttf|otf|eot|mp3|mp4|webm)$).*)",
  ],
};
