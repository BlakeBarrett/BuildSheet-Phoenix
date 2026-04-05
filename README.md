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

### 5. Self-Hosted AI & Local Model Routing
*   **Granular Model Selection:** Enterprise customers can route all AI generation tasks to self-hosted models via any OpenAI-compatible endpoint (LM Studio, Ollama, vLLM, SageMaker).
*   **5 configurable model slots:** Architect, Audit, Plan, CAD/Enclosure (e.g., Nemotron), and General Utility.
*   **Fallback chain:** Specific slot → Utility → Architect → Gemini Cloud.
*   **Search/grounding isolation:** Part search, local suppliers, and data hydration can use a separate API key (`SEARCH_API_KEY`), keeping generation and retrieval credentials decoupled.
*   **Zero-leakage guarantee:** When all local models are configured, no requests reach external APIs for generation tasks.

---

## 🏢 On-Premise Deployment (Coming Soon)

BuildSheet is designed for eventual fully air-gapped, on-premise deployment. See [`docs/ON_PREM_READINESS.md`](docs/ON_PREM_READINESS.md) for the full dependency audit and abstraction roadmap covering:

- Auth provider abstraction (OIDC/LDAP/AD)
- Storage backend abstraction (Postgres/REST)
- Billing bypass (`ENTERPRISE_MODE`)
- Internal parts catalog integration

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

This application is a **Local-First**, containerized SPA deployable on Google Cloud Run or on-premise via Docker.

*   **Runtime:** Node.js 18 (React + Vite)
*   **Persistence:** Browser LocalStorage + IndexedDB (images) + Firestore (authenticated users)
*   **AI Backend:** Gemini Cloud (default), or self-hosted OpenAI-compatible models
*   **API Security:** Client-side environmental injection via `env.sh` / `env-config.js`

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `API_KEY` / `GEMINI_API_KEY` | Yes* | Gemini API key for generation + search |
| `SEARCH_API_KEY` | No | Separate API key for search/grounding (defaults to main key) |
| `LOCAL_ARCHITECT_URL` | No | OpenAI-compatible endpoint for local model |
| `LOCAL_ARCHITECT_MODEL` | No | Model ID at the local endpoint |
| `VITE_FIREBASE_*` | No | Firebase config (auth, Firestore, analytics) |
| `VITE_RECAPTCHA_SITE_KEY` | No | App Check (bot protection) |
| `VITE_STRIPE_*` | No | Stripe billing integration |

\* Not required if all models are configured locally via the Settings Modal.

### Routing
The `app.yaml` supports dynamic sharing:
*   **`/sheet/:slug`**: Routes custom share links (e.g., `buildsheet.app/sheet/gaming-pc-v1`) to the main application for hydration.

## Simulation Mode
If no API Key is provided, the app gracefully degrades into **Simulation Mode**, using a deterministic `MockService` to demonstrate the UI and logic flow without consuming API credits.

## 📁 Project Structure

```
services/
├── aiTypes.ts          # AIService interface (13 methods)
├── aiManager.ts        # Service factory + API key resolution
├── geminiService.ts    # Gemini Cloud implementation
├── localAiService.ts   # Local model implementation (OpenAI-compatible)
├── hybridAiService.ts  # Router: local vs cloud with fallback chain
├── parseUtils.ts       # Shared LLM response parsing
├── mockService.ts      # Offline simulation
└── ...
docs/
└── ON_PREM_READINESS.md  # On-prem deployment audit
tests/
├── settingsModal.spec.ts       # Settings UI tests (all 5 model selectors)
└── localModelRouting.spec.ts   # Zero-leakage routing tests
```