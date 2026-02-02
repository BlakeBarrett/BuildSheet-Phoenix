# BuildSheet

**BuildSheet** is the first **AI-Native Hardware Architect** designed to bridge the gap between generative logic and physical manufacturing. It transforms natural language into validated Bill of Materials (BOM), manufacturing blueprints, and robotic assembly plans.

It is architected as a "Function-First" Agent, using Gemini not just as a chatbot, but as a state-machine that manipulates a drafting board, validates engineering constraints, and orchestrates the supply chain.

## 🚀 Key Features & Google Ecosystem Integration

BuildSheet demonstrates the power of the **Gemini 3.0** models as the operating system for the physical world:

### 1. The "Robotics-ER" Engine (Gemini 3 Pro)
*   **Kinematic Planning:** The system doesn't just list parts; it understands how they fit. It generates step-by-step **Robotic Assembly Plans**, calculating the required end-effectors (grippers), 6-DOF arm movements, and automation feasibility percentages.
*   **Context:** Located in the "Plan Assembly" workflow.

### 2. Legal & Patent Intelligence (Gemini 3 Pro Thinking)
*   **Patent Risk Analysis:** During the "Verify System Integrity" phase, the model performs a deep reasoning pass to identify potential infringement risks against major utility patents (e.g., Apple MagSafe, Tesla thermal loops) based on the mechanical arrangement of the BOM.
*   **Safety & Compliance:** Automatically flags non-compliant voltage mismatches and safety hazards.

### 3. Supply Chain Orchestration (Search & Maps Grounding)
*   **Shopping Graph:** The "Global Source" feature uses **Gemini Search Grounding** to retrieve real-time pricing and stock status from the open web.
*   **Hyper-Local Sourcing:** The "Find Local" feature leverages **Gemini Maps Grounding** to geo-locate physical inventory nearby, supporting local businesses and reducing shipping latency.

### 4. Manufacturing Data Engine (MDE) Bridge
*   **Visual Inspection AI:** The system acts as a Quality Engineer, analyzing component geometry to generate **Inspection Protocols** (JSON) compatible with Google Cloud Visual Inspection AI, defining critical defect criteria before a single part is manufactured.

---

## 🎯 Strategic Alignment: Google 2026 & AI Futures Fund

**To the Judges of the Gemini 3.0 Hackathon:**

BuildSheet represents the transition from the "Information Era" of AI to the **"Action Era"**.

### 1. The "Gemini as OS" Thesis
We are proving that Gemini is not just a text processor, but a **Physics Engine**. By successfully modeling complex hardware interactions, sourcing real-world parts, and generating valid robotic G-code logic, we demonstrate that Gemini is ready to control the factory floor.

### 2. Democratizing Hardware & Job Creation
Hardware engineering historically has a massive "Knowledge Moat." BuildSheet lowers this barrier significantly.
*   **Micro-Manufacturing Renaissance:** By allowing a non-engineer to say "Build me a drone" and receiving a valid BOM, fabrication files, and assembly plan, we empower a new class of "Prompt Engineers for Physical Goods."
*   **Job Growth:** This tool does not replace engineers; it acts as a force multiplier. It shifts human labor from tedious sourcing and compatibility checking to high-value system architecture and innovation. More viable product designs = more manufacturing demand = **more physical jobs**.

### 3. Google Cloud Stickiness
BuildSheet is the "Top of Funnel" for the Google Industrial Cloud ecosystem:
*   Users design in **BuildSheet**.
*   Data exports to **Google Sheets** (Workspace).
*   Quality protocols deploy to **Vertex AI / Visual Inspection AI**.
*   Sourcing drives traffic via **Google Shopping**.

---

## 🛠 Deployment & Architecture

This application is a **Local-First**, Serverless SPA configured for Google App Engine.

*   **Runtime:** Node.js 18 (React + Vite)
*   **Persistence:** Browser LocalStorage (Zero-Database Architecture for privacy and speed).
*   **API Security:** Client-side environmental injection via safe processing.

### Routing
The `app.yaml` supports dynamic sharing:
*   **`/sheet/:slug`**: Routes custom share links (e.g., `buildsheet.app/sheet/gaming-pc-v1`) to the main application for hydration.

## Simulation Mode
If no API Key is provided, the app gracefully degrades into **Simulation Mode**, using a deterministic `MockService` to demonstrate the UI and logic flow without consuming API credits.