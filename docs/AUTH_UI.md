# Username availability and auth presentation

Signup already had username format validation and local username ideas. It now also checks availability after a 450ms pause in typing. Login does not make these requests.

`GET /api/v1/auth/username-availability?username=example_name` returns the normal API envelope with `data: { username: "example_name", available: true }`. The normalized name is trimmed and lowercase. It uses the existing registration rule: 3–30 letters, numbers, underscores, or hyphens. Invalid/non-string input returns 400 before any database query. A fixed equality query against the unique username index returns only availability, without account details. Responses are not cached.

The endpoint permits 60 checks per minute per IP, in addition to the global request limit. These reads do not consume the existing 20-per-15-minute authentication quota. Registration and the unique database index remain authoritative; a live check does not reserve a username.

The signup UI shows Checking, Available, Taken, or Check unavailable. Editing cancels the old request, and late responses cannot overwrite a newer name. Known taken names get an inline error and alternative suggestions. If the checker fails, normal registration remains available. Recognized payloads are not sent to the checker, preserving the existing SQL prank behavior.

Deploy the backend and frontend changes together to enable live checks. An older/unreachable backend shows Check unavailable rather than claiming the name is available.

## Auth-only fluid background

The user-supplied `WebGL-Fluid-Simulation` repository is unchanged. A local MIT-licensed adaptation lives in `fsocietypk-frontend/public/auth-fluid`, including its copyright/license and upstream source hash. Regenerate it with `python3 fsocietypk-frontend/scripts/prepare-auth-fluid.py`.

The real solver/shaders run in a sandboxed decorative frame only while a normal login/signup form is mounted, including the signup verification step. The prank, landing, 404, member, and admin pages do not mount it. The frame receives only normalized pointer coordinates and pause state. No form values, usernames, passwords, or keystrokes are forwarded. The original demo GUI, promotions, analytics, image downloads, and global keyboard/touch controls are removed.

Rendering is capped at 30fps with lower resolutions and a capped pixel ratio; bloom and sunrays are disabled. Reduced motion removes the frame. Missing/lost WebGL uses a static backdrop. The layer cannot intercept clicks or touch scrolling. Route changes remove the frame and release its document/GPU context. The center remains quiet so the forms stay readable in both themes.

## Loading

Shared page/session/data loading uses an animated SVG orbit and relevant status text. The loading indicator has no logo, greetings, terminal text, or fake percentages. Reduced motion displays a static indicator with an accessible busy status.

## Validation

Both TypeScript builds pass. Backend controller tests cover normalization, fixed database filters, scalar validation, available/taken results, minimal output, and no-store responses. The HTTP test exercises the real route and independent check/auth limits with mocked database methods. Browser fixtures exercise availability debounce, stale responses, failures, registration fallback, real WebGL pixels, input isolation, context loss, reduced motion, route cleanup, loading, auth, mascot privacy, and prank behavior without contacting production APIs.

Light-theme fluid visibility now uses full opacity, stronger saturation, and a less restrictive center mask. Dark-theme rendering keeps its previous values.
