# BuildSheet Phoenix

BuildSheet Phoenix is an AI-assisted hardware drafting tool that allows engineers to design systems, validate compatibility, and generate fabrication briefs. It uses a **Local-First** architecture, storing all project data in the browser's `localStorage`.

## Deployment

This application is configured for deployment on Google App Engine.

### Routing Configuration
The `app.yaml` file contains specific handlers to support Single Page Application (SPA) routing and the custom sharing feature.

*   **`/sheet/*`**: Routes all custom project short-links (e.g., `/sheet/my-custom-pc`) to `index.html`. The client-side React router then parses the URL and loads the corresponding project ID from local storage.
*   **Static Assets**: Any request ending in a file extension (e.g., `.js`, `.css`, `.png`) is served directly.
*   **Catch-all**: All other routes fallback to `index.html`.

## Simulation Mode
If no valid API Key is provided, the application defaults to **Simulation Mode**. This mode uses a deterministic Mock Service to demonstrate UI capabilities without consuming AI tokens.

## Project Sharing
Users can reserve custom slugs (e.g., `gaming-pc-v1`) for their projects via the "Share" button in the header.
*   Because this is a local-first demo, sharing links will **only work on the device where they were created**.
*   In a full production environment, this would map the slug to a backend database ID.
