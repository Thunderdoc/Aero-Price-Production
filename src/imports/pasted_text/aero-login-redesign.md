REDESIGN AND POLISH THE AEROPRICE INDIA LOGIN PAGE

Use the attached reference image as the PRIMARY visual reference.

The existing design direction is already excellent and should be PRESERVED.
Do not redesign the page from scratch.

The goal is to keep the current premium government-tech / Smart India
Hackathon aesthetic while correcting the India map and adding realistic
animated flight movement.

============================================================
1. OVERALL DESIGN DIRECTION
============================================================

Product:
AeroPrice India

Subtitle:
India Airfare Intelligence Platform

Context:
Smart India Hackathon 2026
SIH26056

Visual identity:
Premium Indian government technology platform
+
aviation intelligence
+
data visualization
+
modern enterprise SaaS

Design should feel:

- premium
- trustworthy
- government-grade
- technologically advanced
- data-driven
- clean
- sophisticated
- credible

Do NOT make it look like:
- a generic flight booking website
- MakeMyTrip clone
- travel agency
- gaming dashboard
- overly futuristic sci-fi UI
- crypto dashboard
- excessive neon UI

The current dark navy + electric blue visual language should remain.

============================================================
2. PAGE STRUCTURE
============================================================

Maintain the existing split-screen layout.

LEFT:
Approximately 66% viewport width.

RIGHT:
Approximately 34% viewport width.

LEFT = AeroPrice product/visual identity.

RIGHT = Login/authentication panel.

Do not change this fundamental composition.

============================================================
3. LEFT SIDE — HERO AREA
============================================================

Keep the existing:

AeroPrice logo
India Airfare Intelligence Platform

Top navigation:

DATA
|
INSIGHTS
|
POLICY
|
A MORE CONNECTED INDIA

Keep the navigation subtle and non-interactive-looking.

At the top-right of the dark panel retain:

Smart India Hackathon 2026
Prototype

Main heading:

SMARTER AIRFARE
INSIGHTS FOR A
MORE CONNECTED INDIA

Use strong typography.

"MORE CONNECTED INDIA" can retain the electric-blue emphasis.

Supporting copy:

"A unified platform to analyze domestic airfare trends,
compare route-level pricing, and support research,
policy making, and a more accessible air travel ecosystem."

Keep this text.

============================================================
4. CRITICAL FIX — INDIA MAP
============================================================

IMPORTANT:

The India map in the current reference is NOT geographically accurate.

Replace the current manually-drawn/deformed India silhouette with a
PROPER GEOGRAPHICALLY ACCURATE OUTLINE OF INDIA.

Do NOT manually draw the country shape using approximate SVG points.

Use a proper geographic source such as:

- GeoJSON
- TopoJSON
- Natural Earth
- an accurate India administrative boundary dataset

The resulting silhouette must visually match the actual geographic
outline of India.

Requirements:

- correct northern boundary shape
- correct western coastline
- correct eastern coastline
- correct southern peninsula
- correct northeast geometry
- correct general proportions
- correct placement relative to Delhi, Mumbai, Bengaluru,
  Hyderabad, Chennai and Kolkata

Do NOT add unnecessary state boundaries.

The primary map should be a clean INDIA NATIONAL OUTLINE.

Keep the map stylized, but geographically correct.

============================================================
5. MAP STYLE
============================================================

The map should NOT look like Google Maps.

Use a premium data-visualization treatment:

India outline:
thin electric-blue stroke

Interior:
very subtle transparent navy/blue fill

Glow:
soft blue outer glow

Grid:
very subtle geographic/data grid behind the map

No road map.

No terrain.

No unnecessary labels.

The map should visually blend into the dark navy background.

Suggested hierarchy:

INDIA OUTLINE
    ↓
AIRPORT NODES
    ↓
ROUTE LINES
    ↓
MOVING AIRCRAFT
    ↓
SUBTLE GLOW

============================================================
6. AIRPORT NODES
============================================================

Use the following major airport/city nodes.

DEL — Delhi
BOM — Mumbai
BLR — Bengaluru
HYD — Hyderabad
MAA — Chennai
CCU — Kolkata

Position them according to their REAL geographic locations.

Approximate visual relationship:

DEL = north India
BOM = west
BLR = south-central
HYD = central-south
MAA = southeast
CCU = east

Do NOT position nodes purely for visual symmetry.

They must correspond to their real geographic positions on the
accurate India map.

Airport node design:

Small blue glowing point.

Major hubs:

larger central dot
+
soft blue radial glow

Add labels:

DEL
Delhi

BOM
Mumbai

BLR
Bengaluru

HYD
Hyderabad

MAA
Chennai

CCU
Kolkata

Labels should be clean and small.

============================================================
7. ROUTE NETWORK
============================================================

Add several realistic domestic air corridors.

Primary routes:

DEL → BOM
DEL → BLR
DEL → HYD
DEL → CCU
BOM → BLR
BOM → MAA
BLR → HYD
BLR → MAA
HYD → MAA
DEL → MAA

Secondary routes can be added with lower opacity.

Do NOT create a giant web of hundreds of lines.

The purpose is to visually communicate:

"India's domestic airfare network"

not to represent every single flight in India.

============================================================
8. ROUTE LINE DESIGN
============================================================

Use two levels.

PRIMARY ROUTE:

thin bright-blue line
opacity approximately 45–70%

SECONDARY ROUTE:

thin blue line
opacity approximately 15–30%

Routes should have:

- subtle glow
- rounded line caps
- smooth curves

Avoid thick solid lines.

Use curved paths instead of perfectly straight lines where appropriate.

============================================================
9. MOST IMPORTANT — ANIMATED FLIGHTS
============================================================

Add REALISTIC MOVEMENT OF AIRCRAFT ICONS ALONG THE ROUTES.

This is the key improvement.

Aircraft should NOT simply float around randomly.

Each aircraft must move along a defined route.

Example:

DEL → BOM

Aircraft begins near DEL.

Aircraft smoothly travels along the route.

Aircraft reaches BOM.

Then:

Option A:
Aircraft disappears and another aircraft begins.

OR

Option B:
Aircraft reverses direction only if the route is configured as
bidirectional.

Use Option A for a more realistic one-way flight visualization.

============================================================
10. FLIGHT ANIMATION
============================================================

Use SVG path animation / CSS animation / Framer Motion /
requestAnimationFrame depending on the existing implementation.

Do NOT use random screen coordinates.

Each aircraft should have:

route
start point
end point
duration
direction
aircraft icon

Example data structure:

{
  route: "DEL-BOM",
  from: "DEL",
  to: "BOM",
  duration: 7000,
  delay: 1000,
  direction: "forward"
}

Another:

{
  route: "BOM-BLR",
  from: "BOM",
  to: "BLR",
  duration: 8500,
  delay: 3500,
  direction: "forward"
}

============================================================
11. AIRCRAFT ICON
============================================================

Use a very small aircraft silhouette.

Aircraft should appear approximately:

12–18 px

depending on viewport.

Use the same electric blue / white visual language.

Aircraft should have:

subtle glow
+
smooth movement

Do NOT make aircraft icons huge.

They are visual indicators, not the primary content.

============================================================
12. MULTIPLE SIMULTANEOUS FLIGHTS
============================================================

At any moment show approximately:

4–7 moving aircraft.

Example:

Aircraft 1:
DEL → BOM

Aircraft 2:
DEL → BLR

Aircraft 3:
BOM → MAA

Aircraft 4:
DEL → CCU

Aircraft 5:
BLR → HYD

Aircraft 6:
HYD → MAA

Each should have a different:

delay
duration
route

so that they do not move synchronously.

Avoid all aircraft moving at exactly the same time.

The animation should feel organic.

============================================================
13. FLIGHT DIRECTION
============================================================

Aircraft orientation should follow the direction of travel.

If aircraft moves:

DEL → BOM

nose points toward BOM.

If another aircraft moves:

BOM → DEL

nose points toward DEL.

Rotate the aircraft dynamically based on the tangent of the route path.

This is important.

Do NOT keep every aircraft icon facing the same direction.

============================================================
14. ANIMATION LOOP
============================================================

The animation should continuously loop.

Example:

DEL → BOM
    ↓
arrive
    ↓
fade/disappear
    ↓
delay
    ↓
new aircraft begins

This creates the impression of an active aviation network.

Do NOT abruptly teleport aircraft.

Use:

ease-in
linear cruise
ease-out

or a smooth linear flight with subtle acceleration/deceleration.

============================================================
15. ROUTE HIGHLIGHT
============================================================

When an aircraft is moving along a route:

temporarily increase that route's opacity.

Example:

normal route:

opacity = 0.25

active route:

opacity = 0.65

Add a subtle moving glow/trail behind the aircraft.

Do NOT create an exaggerated neon trail.

Keep it professional.

============================================================
16. MAP BACKGROUND
============================================================

Keep the airport-at-night background visual from the current design.

However, reduce its visual competition with the map.

The map must remain readable.

Use a dark navy overlay over the airport image.

The India map and flight network should remain the dominant visual.

Do NOT replace the airport background.

============================================================
17. INFORMATION CARDS
============================================================

Keep the existing three cards:

Route Analysis
"Compare & explore fares across routes"

Trend Insights
"Track historical price movements"

Price Alerts
"Stay updated on significant changes"

Preserve their current style.

Improve only spacing/alignment if necessary.

Use subtle hover effects:

translateY(-2px)
+
slight blue glow

Do not over-animate them.

============================================================
18. INDIA AVIATION NETWORK STATISTICS
============================================================

Keep:

INDIA'S AVIATION NETWORK

6
Major Metro Hubs

100+
Important Airports

Domestic Connectivity
Across the Country

These statistics should remain on the left.

Use clean typography.

Do not add fake real-time statistics.

============================================================
19. RIGHT SIDE LOGIN PANEL
============================================================

The current right-side authentication panel is visually strong.

KEEP IT.

Maintain:

Government of India / Ministry of Civil Aviation branding
Secure Access
Welcome back
Email Address
Password
Remember me
Forgot password?
Sign In
OR
Continue with Google

Keep the white/light background.

Keep the rounded login card.

Keep the blue Sign In button.

Keep the security indicators:

Secure & Encrypted Authentication
Authorized Access Only
Your Data Stays Protected

Do not redesign the login form unnecessarily.

============================================================
20. GOVERNMENT BRANDING
============================================================

Keep:

Ministry of Civil Aviation
Government of India

and the Government emblem in the upper-right panel.

However:

Do not imply that AeroPrice is an official government product.

Use:

"Smart India Hackathon 2026 Prototype"

clearly as the project context.

The visual relationship should communicate:

built for government/public-policy use

rather than falsely claiming government ownership.

============================================================
21. RESPONSIVENESS
============================================================

Desktop-first design.

At width >= 1200px:

66/34 split.

At tablet width:

reduce map complexity.

At mobile width:

stack vertically.

Hide secondary route animations if necessary.

Prioritize:

logo
heading
map
login

Do not allow the map animation to make the login form unusable.

============================================================
22. PERFORMANCE
============================================================

The animated map must be lightweight.

Prefer:

SVG paths
CSS transforms
requestAnimationFrame
Framer Motion

Avoid:

heavy WebGL
large video backgrounds
continuous expensive React re-renders

Aircraft animation should use transform/translate/rotate whenever
possible.

Do NOT update the entire React component tree every animation frame.

Use GPU-friendly transforms.

============================================================
23. ACCESSIBILITY
============================================================

Respect:

prefers-reduced-motion

If reduced motion is enabled:

- stop aircraft movement
- retain static route lines
- retain airport nodes
- retain map glow

Do not remove the map completely.

============================================================
24. VISUAL HIERARCHY
============================================================

The final page should read visually in this order:

1. AeroPrice logo
2. Main headline
3. Accurate India map
4. Moving flight network
5. Route/Trend/Alert cards
6. Aviation network statistics
7. Login form

The animated aircraft should enhance the map,
not distract from the headline.

============================================================
25. DO NOT CHANGE
============================================================

Do NOT change:

- overall split-screen concept
- dark navy left panel
- white right panel
- headline
- AeroPrice branding
- airport background
- login form structure
- Smart India Hackathon branding
- Ministry of Civil Aviation placement
- overall premium visual identity

Only improve:

1. India map accuracy
2. geographic airport placement
3. route accuracy
4. flight movement animation
5. subtle route highlighting
6. responsive/performance behavior

============================================================
26. IMPLEMENTATION REQUIREMENT
============================================================

Use a real geographic India GeoJSON/TopoJSON boundary.

Do NOT create a fake approximate India SVG.

Create a reusable component:

<IndiaFlightMap />

Suggested structure:

IndiaFlightMap/
    IndiaFlightMap.tsx
    india.geojson
    airports.ts
    routes.ts
    flightAnimation.ts

Data:

AIRPORTS = [
  { code: "DEL", name: "Delhi", lat: ..., lon: ... },
  { code: "BOM", name: "Mumbai", lat: ..., lon: ... },
  { code: "BLR", name: "Bengaluru", lat: ..., lon: ... },
  { code: "HYD", name: "Hyderabad", lat: ..., lon: ... },
  { code: "MAA", name: "Chennai", lat: ..., lon: ... },
  { code: "CCU", name: "Kolkata", lat: ..., lon: ... }
]

ROUTES = [
  { from: "DEL", to: "BOM" },
  { from: "DEL", to: "BLR" },
  { from: "DEL", to: "HYD" },
  { from: "DEL", to: "CCU" },
  { from: "BOM", to: "BLR" },
  { from: "BOM", to: "MAA" },
  { from: "BLR", to: "HYD" },
  { from: "BLR", to: "MAA" },
  { from: "HYD", to: "MAA" },
  { from: "DEL", to: "MAA" }
]

FLIGHTS = [
  {
    id: "F1",
    from: "DEL",
    to: "BOM",
    duration: 7000,
    delay: 0
  },
  {
    id: "F2",
    from: "DEL",
    to: "BLR",
    duration: 9000,
    delay: 2200
  },
  {
    id: "F3",
    from: "BOM",
    to: "MAA",
    duration: 8000,
    delay: 4200
  },
  {
    id: "F4",
    from: "DEL",
    to: "CCU",
    duration: 6500,
    delay: 1600
  },
  {
    id: "F5",
    from: "BLR",
    to: "HYD",
    duration: 5000,
    delay: 3200
  }
]

Use the actual geographic coordinates to position the airports.

============================================================
27. FINAL QUALITY CHECK
============================================================

Before completing:

1. Verify India silhouette is geographically recognizable.
2. Verify Delhi is north of Mumbai/Bengaluru/Chennai.
3. Verify Kolkata is east.
4. Verify Chennai is southeast.
5. Verify Mumbai is west.
6. Verify Bengaluru is south-central.
7. Verify Hyderabad is between central and southern India.
8. Verify routes connect the correct airports.
9. Verify aircraft move along the actual route.
10. Verify aircraft orientation follows movement direction.
11. Verify aircraft have different timings.
12. Verify animation loops smoothly.
13. Verify no aircraft teleports.
14. Verify no route passes through obviously unrelated locations.
15. Verify reduced-motion accessibility.
16. Verify login panel remains unchanged and fully usable.
17. Verify no fake "LIVE" airfare data is displayed on the login page.

FINAL RESULT:

The page should look like a premium aviation intelligence platform
monitoring India's domestic airfare network in real time.

The map should communicate:

"India is connected by a living network of domestic air travel."

The moving aircraft should provide subtle visual proof of activity
without making any unsupported claim that these represent actual
real-time flights.

Do not add fake real-time flight numbers or fake live prices.
The animation is purely a visual representation of the platform's
aviation-network concept unless connected to a verified live source.