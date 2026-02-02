## Inspiration
We live in a golden age of software, but **hardware is still gated.** If a regular person has an idea—like "a solar-powered cat feeder" or "a custom macro-pad"—they hit a wall. They don't know CAD, they don't know component compatibility, and they don't know how to source parts from twelve different vendors.

We built BuildSheet to be the **"GitHub of Hardware."** Just as GitHub democratized code, BuildSheet democratizes manufacturing. We leverage **Gemini 3 Pro** to bridge the gap between a "Rough Draft" and a validated "Kit of Parts" ready for assembly.

## What it does
BuildSheet is a generative hardware platform that turns natural language into physical reality. It uses a "Consumer-to-Cloud" agentic workflow:

1.  **The Architect Agent (Generative Design):**
    Users describe their intent (e.g., "I need a low-power weather station"). BuildSheet uses **Gemini 3 Pro's** advanced reasoning to architect the engineering solution, generating a valid Bill of Materials (BOM), wiring diagrams, and component specs instantly.

2.  **The Sourcing Agent (Shopping Graph):**
    This is the commerce engine. Leveraging **Google Shopping Grounding**, the agent hunts for specific parts across the open web. It doesn't just list links; it **bundles** them. It calculates total cost, checks stock levels, and prepares a single "One-Click Kit."

3. **The Kinematic Validator (Gemini Robotics-ER):**
    Before you buy, you need to know it fits. We repurpose the Gemini Robotics-ER (Embodied Reasoning) model—typically used for robot arm planning—to act as a "Spatial Unit Test." It reasons about physical constraints (e.g., "Will this 40mm fan fit in a 1U chassis with the cabling?"), preventing the user from ordering incompatible hardware.

## How we built it
BuildSheet is a **Local-First** application migrating to a cloud-native architecture.
* **Frontend:** A React-based "Drafting Table" where users can visually drag-and-drop parts or let AI auto-arrange them.
* **The Brain:** We use **Gemini 3 Pro** via Vertex AI. Its multimodal capabilities allow it to "read" datasheet PDFs and reason about pin compatibility (e.g., 3.3V vs 5V logic) better than any previous model.
* **The Logistics:** We integrate **Google Maps** for local availability ("Pickup at Micro Center") and **Google Shopping** for global sourcing.
* **The Safety Layer:** A custom implementation of **Manufacturing Data Engine (MDE)** logic to flag "Critical Quality Defects" before purchase.

## Challenges we ran into
The "Amazon Problem." AI is great at hallucinating parts that *should* exist but don't. Early versions of our agent would invent screws or sensors that were theoretically perfect but impossible to buy.
We solved this with a **"Grounding Loop."** Every time Gemini suggests a part, the Sourcing Agent hits the Shopping Graph API. If the part isn't purchasable, the Agent is forced to **redesign the subsystem** using only in-stock components. This constraint-based reasoning is the core IP of our platform.

## Accomplishments that we're proud of
We are incredibly proud of the **"One-Click Kit"** logic. Taking a messy list of 30 electronic components and resolving them into a single cart with live pricing feels like magic. It validates that the **Google Shopping Graph** isn't just for finished goods—it's the backbone for a new economy of custom manufacturing.

## What's next for BuildSheet
We aim to become the **"Play Store for Physical Objects."**
1.  **Text-to-CAD:** Allowing users to 3D print custom enclosures that fit their generated kits perfectly.
2.  **Multimodal AR Guides:** A kit is useless if you can't build it. We plan to use **Gemini 3’s multimodal vision** to generate step-by-step AR instructions. Users point their phone at their pile of parts, and BuildSheet overlays 3D arrows showing exactly where to plug in the jumper wires.
3.  **The Registry:** A marketplace where users publish successful "Drafts," allowing others to order the same kit with one click.