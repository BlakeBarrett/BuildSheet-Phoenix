# BuildSheet-Phoenix Backlog

## Core Physical AI Features

### 1. Visual Parts Audit
- **Goal:** Implement a multimodal interface to upload images of physical components alongside natural language prompts.
- **Purpose:** Identification and condition reporting of mechanical components.

### 2. BOM Lifecycle Management
- **Goal:** Add full CRUD functionality (Add, Remove, Edit) for the Bill of Materials (BOM).
- **Triggers:** A manual edit must trigger a "Re-Validation" process (calling the Architect Agent to check constraints).

### 3. Kinematic-to-CAD Bridge
- **Goal:** Develop an OpenSCAD generation pipeline for custom adapters.
- **Output:** Raw OpenSCAD code generation for transparency and manufacturing.

### 4. Legacy Manual Archaeology
- **Goal:** A pipeline to ingest and verify structural/mechanical data from 1970s PDF service manuals.
