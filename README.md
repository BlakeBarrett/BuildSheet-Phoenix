# BuildSheet Phoenix

BuildSheet Phoenix is an AI-assisted hardware drafting tool that allows engineers to design systems, validate compatibility, and generate fabrication briefs. It uses a **Local-First** architecture, storing all project data in the browser's `localStorage`.

## Google Ecosystem Integration
BuildSheet is architected to demonstrate the power of the Gemini API as a bridge to the wider Google ecosystem:

*   **Shopping Graph**: The "Global Source" tab leverages **Gemini Search Grounding** to retrieve real-time pricing, merchant data, and product thumbnails from the open web, simulating a direct connection to the Google Shopping Graph.
*   **Maps Platform**: The "Nearby" tab utilizes **Gemini Maps Grounding** to geo-locate physical electronics stores and hardware suppliers near the user's location.
*   **Google Workspace**: The Build pane features a dedicated "Export to Sheets" workflow, generating a CSV specifically formatted for seamless ingestion into Google Sheets.

## Manufacturing Data Engine (MDE)
To bridge the gap between design and production, BuildSheet integrates concepts from Google's industrial AI portfolio:

*   **Visual Inspection AI**: The "Quality" tab within the Part Detail view uses **Gemini 3.0 Pro** to act as a Quality Engineer. It analyzes the component's geometry and category to:
    1.  Predict specific manufacturing defects (e.g., "Bent Pins", "Surface Scratches").
    2.  Assign severity levels (Critical, Major, Minor).
    3.  Generate a hardware sensor configuration (Camera/Lighting) compatible with Google Visual Inspection AI edge deployments.

## Deployment

This application is configured for deployment on Google App Engine.

### Routing Configuration
The `app.yaml` file contains specific handlers to support Single Page Application (SPA) routing and the custom sharing feature.

*   **`/sheet/*`**: Routes all custom project short-links (e.g., `/sheet/my-custom-pc`) to `index.html`. The client-side React router then parses the URL and loads the corresponding project ID from local storage.
*   **Static Assets**: Any request ending in a file extension (e.g., `.js`, `.css`, `.png`) is served directly.
*   **Catch-all**: All other routes fallback to `index.html`.

## Simulation Mode
If no valid API Key is provided, the application defaults to **Simulation Mode**. This mode uses a deterministic Mock Service to demonstrate UI capabilities (including simulated Shopping and Maps results) without consuming AI tokens.

## Project Sharing
Users can reserve custom slugs (e.g., `gaming-pc-v1`) for their projects via the "Share" button in the header.
*   Because this is a local-first demo, sharing links will **only work on the device where they were created**.
*   In a full production environment, this would map the slug to a backend database ID.