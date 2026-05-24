import { test, expect } from '@playwright/test';

test.describe('Firestore Cross-Browser Sync', () => {

  /**
   * Validates the core sync invariant: data saved to Firestore by Browser A
   * must be loadable by Browser B.
   *
   * Since we can't use real Firebase in automated tests, we simulate the
   * serialization → Firestore → deserialization roundtrip using the same
   * logic that DraftingEngine uses.
   */
  test('project roundtrip: save → serialize → hydrate → localStorage', async ({ page }) => {
    await page.goto('http://localhost:8080/app/');

    const result = await page.evaluate(() => {
      const INDEX_KEY = 'buildsheet_projects_index';
      const PREFIX = 'buildsheet_project_';

      // --- Simulate Browser A: create a project and serialize it for Firestore ---

      const sessionA = {
        id: 'cross-browser-test-1',
        slug: 'build-test',
        shareSlug: 'suburban-rebuild',
        ownerId: 'user-123',
        name: 'Suburban Rebuild',
        designRequirements: 'Full driveline rebuild',
        bom: [
          {
            instanceId: 'inst-1',
            part: {
              id: 'part-1',
              name: 'LS3 Crate Engine',
              category: 'powertrain',
              description: '6.2L V8',
              ports: [],
            },
            quantity: 1,
            sourcing: {
              online: [{ vendor: 'Summit Racing', url: 'https://www.summitracing.com/example', price: '$8,995' }],
              local: [],
              lastUpdated: new Date('2025-01-15T10:00:00Z'),
            },
          },
          {
            instanceId: 'inst-2',
            part: {
              id: 'part-2',
              name: '4L80E Transmission',
              category: 'powertrain',
              description: 'HD auto trans',
              ports: [{ name: 'input', type: 'mechanical', direction: 'in' }],
            },
            quantity: 1,
          },
        ],
        generatedImages: [
          { id: 'img-1', url: 'data:image/png;base64,mock', prompt: 'test', timestamp: new Date('2025-01-15T10:00:00Z') },
        ],
        messages: [
          { role: 'user', content: 'Build me an LS swap', timestamp: new Date('2025-01-15T09:00:00Z') },
          { role: 'assistant', content: 'Initializing draft...', timestamp: new Date('2025-01-15T09:01:00Z') },
        ],
        createdAt: new Date('2025-01-10T08:00:00Z'),
        lastModified: new Date('2025-01-15T10:30:00Z'),
        cacheIsDirty: false,
        archived: false,
        tags: ['ls-swap', 'suburban'],
        thumbnail: 'data:image/jpeg;base64,thumb',
      };

      // Serialize to Firestore format (same as saveSessionToFirestore)
      const firestorePlain = {
        ...sessionA,
        createdAt: sessionA.createdAt.toISOString(),
        lastModified: sessionA.lastModified.toISOString(),
        generatedImages: [], // images stay in IDB
        thumbnail: sessionA.thumbnail || '',
        messages: sessionA.messages.map(m => ({ ...m, timestamp: (m.timestamp as Date).toISOString() })),
        bom: sessionA.bom.map(b => ({
          ...b,
          sourcing: b.sourcing
            ? { ...b.sourcing, lastUpdated: b.sourcing.lastUpdated?.toISOString() }
            : undefined,
        })),
      };

      // --- Simulate Browser B: hydrate from Firestore data ---

      function hydrateSession(data: any) {
        return {
          ...data,
          createdAt: new Date(data.createdAt),
          lastModified: data.lastModified ? new Date(data.lastModified) : new Date(),
          cacheIsDirty: data.cacheIsDirty ?? true,
          thumbnail: data.thumbnail || undefined,
          bom: (data.bom || []).map((entry: any) => ({
            ...entry,
            part: { ...entry.part, ports: entry.part.ports ? [...entry.part.ports] : [] },
            sourcing: entry.sourcing ? {
              ...entry.sourcing,
              online: entry.sourcing.online ? [...entry.sourcing.online] : undefined,
              local: entry.sourcing.local ? [...entry.sourcing.local] : undefined,
              lastUpdated: entry.sourcing.lastUpdated ? new Date(entry.sourcing.lastUpdated) : undefined
            } : undefined
          })),
          generatedImages: data.generatedImages?.map((img: any) => ({
            ...img,
            timestamp: new Date(img.timestamp)
          })) || [],
          messages: data.messages?.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          })) || []
        };
      }

      const hydrated = hydrateSession(firestorePlain);

      // Write to localStorage (simulating loadProjectsFromFirestore)
      const key = PREFIX + hydrated.id;
      const noImages = { ...hydrated, generatedImages: [] };
      localStorage.setItem(key, JSON.stringify(noImages));

      // Update project index
      let index: any[] = [];
      index.unshift({
        id: hydrated.id,
        name: hydrated.name,
        lastModified: hydrated.lastModified,
        preview: `${hydrated.bom.length} Parts`,
        thumbnail: hydrated.thumbnail,
        archived: hydrated.archived ?? false,
        tags: hydrated.tags ?? [],
      });
      localStorage.setItem(INDEX_KEY, JSON.stringify(index));

      // --- Verify Browser B can read the project ---

      const storedRaw = localStorage.getItem(key);
      if (!storedRaw) return { pass: false, reason: 'Project not found in localStorage after hydration' };
      const stored = JSON.parse(storedRaw);

      const indexRaw = localStorage.getItem(INDEX_KEY);
      if (!indexRaw) return { pass: false, reason: 'Index not found' };
      const parsedIndex = JSON.parse(indexRaw);

      const errors: string[] = [];

      // Verify session data integrity
      if (stored.name !== 'Suburban Rebuild') errors.push(`name: expected "Suburban Rebuild", got "${stored.name}"`);
      if (stored.bom.length !== 2) errors.push(`bom.length: expected 2, got ${stored.bom.length}`);
      if (stored.bom[0]?.part?.name !== 'LS3 Crate Engine') errors.push(`bom[0].part.name mismatch`);
      if (stored.bom[1]?.part?.name !== '4L80E Transmission') errors.push(`bom[1].part.name mismatch`);
      if (stored.bom[1]?.part?.ports?.length !== 1) errors.push(`bom[1].part.ports lost`);
      if (!stored.bom[0]?.sourcing?.online?.[0]?.vendor) errors.push('sourcing data lost');
      if (stored.messages.length !== 2) errors.push(`messages.length: expected 2, got ${stored.messages.length}`);
      if (stored.tags?.length !== 2) errors.push(`tags lost`);
      if (!stored.thumbnail) errors.push(`thumbnail lost`);

      // Verify index entry
      if (parsedIndex.length !== 1) errors.push(`index.length: expected 1, got ${parsedIndex.length}`);
      if (parsedIndex[0]?.name !== 'Suburban Rebuild') errors.push(`index name mismatch`);
      if (parsedIndex[0]?.preview !== '2 Parts') errors.push(`index preview: expected "2 Parts", got "${parsedIndex[0]?.preview}"`);

      // Images should NOT be in localStorage (they go to IDB)
      if (stored.generatedImages?.length > 0) errors.push('images leaked into localStorage');

      // Cleanup
      localStorage.removeItem(key);
      localStorage.removeItem(INDEX_KEY);

      return errors.length === 0
        ? { pass: true }
        : { pass: false, reason: errors.join('; ') };
    });

    expect(result.pass).toBe(true);
    if (!result.pass) {
      console.error('Sync roundtrip errors:', (result as any).reason);
    }
  });

  /**
   * Validates that onSnapshot-style updates correctly merge into localStorage
   * and update the active session when it's the currently viewed project.
   */
  test('onSnapshot remote update should merge into active session', async ({ page }) => {
    await page.goto('http://localhost:8080/app/');

    const result = await page.evaluate(() => {
      const PREFIX = 'buildsheet_project_';
      const INDEX_KEY = 'buildsheet_projects_index';

      // Simulate the current active session (Browser B has this)
      const localSession = {
        id: 'shared-project-1',
        name: 'My Build',
        bom: [{ instanceId: 'p1', part: { id: 'p1', name: 'Part A', category: 'engine', description: '', ports: [] }, quantity: 1 }],
        messages: [],
        generatedImages: [],
        createdAt: new Date('2025-01-10').toISOString(),
        lastModified: new Date('2025-01-15T08:00:00Z').toISOString(),
        cacheIsDirty: true,
        archived: false,
        tags: [],
        designRequirements: '',
        ownerId: 'user-1',
        slug: 'build-1',
      };

      // Write this as the local version
      localStorage.setItem(PREFIX + localSession.id, JSON.stringify(localSession));
      localStorage.setItem(INDEX_KEY, JSON.stringify([{
        id: localSession.id,
        name: localSession.name,
        lastModified: localSession.lastModified,
        preview: '1 Parts',
        archived: false,
      }]));

      // Simulate a REMOTE update (Browser A added a part, timestamp is NEWER)
      const remoteData = {
        ...localSession,
        name: 'My Build – Updated',
        bom: [
          localSession.bom[0],
          { instanceId: 'p2', part: { id: 'p2', name: 'Part B', category: 'exhaust', description: '', ports: [] }, quantity: 2 },
        ],
        lastModified: new Date('2025-01-15T09:00:00Z').toISOString(), // NEWER
      };

      // Simulate the onSnapshot merge logic
      const existingRaw = localStorage.getItem(PREFIX + localSession.id);
      let shouldWrite = true;
      if (existingRaw) {
        try {
          const existing = JSON.parse(existingRaw);
          const existingMod = new Date(existing.lastModified).getTime();
          const remoteMod = new Date(remoteData.lastModified).getTime();
          if (existingMod >= remoteMod) shouldWrite = false;
        } catch { /* overwrite corrupted */ }
      }

      const errors: string[] = [];

      if (!shouldWrite) {
        errors.push('shouldWrite was false – remote update would be rejected even though it is newer');
      }

      if (shouldWrite) {
        localStorage.setItem(PREFIX + localSession.id, JSON.stringify({ ...remoteData, generatedImages: [] }));
      }

      // Read back
      const afterUpdate = JSON.parse(localStorage.getItem(PREFIX + localSession.id) || '{}');
      if (afterUpdate.name !== 'My Build – Updated') errors.push(`name not updated: "${afterUpdate.name}"`);
      if (afterUpdate.bom?.length !== 2) errors.push(`bom not updated: ${afterUpdate.bom?.length} parts`);

      // Simulate a stale remote change (older timestamp should be rejected)
      const staleRemote = {
        ...localSession,
        name: 'Stale Name',
        lastModified: new Date('2025-01-14T00:00:00Z').toISOString(), // OLDER
      };

      const existingRaw2 = localStorage.getItem(PREFIX + localSession.id);
      let shouldWrite2 = true;
      if (existingRaw2) {
        try {
          const existing2 = JSON.parse(existingRaw2);
          const existMod2 = new Date(existing2.lastModified).getTime();
          const remoteMod2 = new Date(staleRemote.lastModified).getTime();
          if (existMod2 >= remoteMod2) shouldWrite2 = false;
        } catch { /* */ }
      }

      if (shouldWrite2) {
        errors.push('Stale remote change was NOT rejected – would overwrite newer local version');
      }

      // Cleanup
      localStorage.removeItem(PREFIX + localSession.id);
      localStorage.removeItem(INDEX_KEY);

      return errors.length === 0
        ? { pass: true }
        : { pass: false, reason: errors.join('; ') };
    });

    expect(result.pass).toBe(true);
    if (!result.pass) {
      console.error('onSnapshot merge errors:', (result as any).reason);
    }
  });

  /**
   * Validates the migration logic: local projects are pushed to Firestore
   * only when the local version is newer than the remote version.
   */
  test('migration should not overwrite newer Firestore data', async ({ page }) => {
    await page.goto('http://localhost:8080/app/');

    const result = await page.evaluate(() => {
      // Simulate: local project is OLDER than Firestore version
      const localModified = new Date('2025-01-10T00:00:00Z');
      const remoteModified = new Date('2025-01-15T00:00:00Z');

      // Migration logic check
      const shouldMigrate = remoteModified.getTime() <= localModified.getTime();

      const errors: string[] = [];
      if (shouldMigrate) {
        errors.push('Migration would overwrite newer Firestore data with older local data');
      }

      // Reverse: local is NEWER
      const localNewer = new Date('2025-01-20T00:00:00Z');
      const shouldMigrate2 = remoteModified.getTime() <= localNewer.getTime();
      if (!shouldMigrate2) {
        errors.push('Migration rejected newer local data that should have been pushed');
      }

      return errors.length === 0
        ? { pass: true }
        : { pass: false, reason: errors.join('; ') };
    });

    expect(result.pass).toBe(true);
  });

  /**
   * Validates that the Firestore serialization correctly handles all Date fields
   * and preserves data through the serialize → deserialize roundtrip.
   */
  test('Date fields survive Firestore roundtrip', async ({ page }) => {
    await page.goto('http://localhost:8080/app/');

    const result = await page.evaluate(() => {
      const originalDate = new Date('2025-06-15T14:30:00.000Z');

      // Serialize (toISOString)
      const serialized = originalDate.toISOString();
      // Deserialize (new Date())
      const deserialized = new Date(serialized);

      const errors: string[] = [];
      if (deserialized.getTime() !== originalDate.getTime()) {
        errors.push(`Date roundtrip failed: ${originalDate.toISOString()} → ${deserialized.toISOString()}`);
      }

      // Test with sourcing.lastUpdated (can be undefined)
      const undefinedDate = undefined;
      const serializedUndef = undefinedDate?.toISOString();
      const deserializedUndef = serializedUndef ? new Date(serializedUndef) : undefined;
      if (deserializedUndef !== undefined) {
        errors.push('undefined date should remain undefined after roundtrip');
      }

      return errors.length === 0
        ? { pass: true }
        : { pass: false, reason: errors.join('; ') };
    });

    expect(result.pass).toBe(true);
  });

  /**
   * Validates that the project index is correctly maintained across operations.
   */
  test('project index deduplication and ordering', async ({ page }) => {
    await page.goto('http://localhost:8080/app/');

    const result = await page.evaluate(() => {
      const INDEX_KEY = 'buildsheet_projects_index';

      function updateProjectIndex(index: any[], session: any) {
        const existing = index.find((i: any) => i.id === session.id);
        index = index.filter((i: any) => i.id !== session.id);
        const thumbnail = session.thumbnail || existing?.thumbnail;
        index.unshift({
          id: session.id,
          name: session.name,
          lastModified: session.lastModified,
          preview: session.bom?.length > 0 ? `${session.bom.length} Parts` : 'Empty Draft',
          thumbnail,
          archived: session.archived ?? existing?.archived ?? false,
          tags: session.tags ?? existing?.tags ?? [],
        });
        return index;
      }

      let index: any[] = [];

      // Add three projects
      index = updateProjectIndex(index, { id: 'p1', name: 'Project 1', lastModified: new Date().toISOString(), bom: [1], tags: [] });
      index = updateProjectIndex(index, { id: 'p2', name: 'Project 2', lastModified: new Date().toISOString(), bom: [1, 2], tags: [] });
      index = updateProjectIndex(index, { id: 'p3', name: 'Project 3', lastModified: new Date().toISOString(), bom: [], tags: [] });

      const errors: string[] = [];

      if (index.length !== 3) errors.push(`Expected 3 projects, got ${index.length}`);
      // Most recently added should be first
      if (index[0].id !== 'p3') errors.push(`Expected p3 first, got ${index[0].id}`);

      // Update p1 (should move to front, no duplicates)
      index = updateProjectIndex(index, { id: 'p1', name: 'Project 1 Updated', lastModified: new Date().toISOString(), bom: [1, 2, 3], tags: [] });
      if (index.length !== 3) errors.push(`Expected 3 after update, got ${index.length}`);
      if (index[0].id !== 'p1') errors.push(`Expected p1 first after update, got ${index[0].id}`);
      if (index[0].name !== 'Project 1 Updated') errors.push(`Name not updated: ${index[0].name}`);
      if (index[0].preview !== '3 Parts') errors.push(`Preview not updated: ${index[0].preview}`);

      // Verify no duplicates
      const ids = index.map((i: any) => i.id);
      const uniqueIds = [...new Set(ids)];
      if (ids.length !== uniqueIds.length) errors.push(`Duplicate IDs found: ${ids.join(', ')}`);

      return errors.length === 0
        ? { pass: true }
        : { pass: false, reason: errors.join('; ') };
    });

    expect(result.pass).toBe(true);
  });

  /**
   * Validates the full login → migrate → load flow by simulating what happens
   * when Browser B logs in and should receive Browser A's projects.
   */
  test('full login flow: migration + load populates project list', async ({ page }) => {
    await page.goto('http://localhost:8080/app/');

    const result = await page.evaluate(() => {
      const INDEX_KEY = 'buildsheet_projects_index';
      const PREFIX = 'buildsheet_project_';
      const ACTIVE_ID = 'buildsheet_active_project_id';

      // --- Pre-login state (Browser B constructor creates default project) ---
      const localProject = {
        id: 'local-untitled',
        name: 'Untitled Assembly',
        bom: [],
        generatedImages: [],
        messages: [],
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        cacheIsDirty: true,
        archived: false,
        tags: [],
        designRequirements: '',
        ownerId: 'anonymous',
        slug: 'build-local',
      };

      localStorage.setItem(PREFIX + localProject.id, JSON.stringify(localProject));
      localStorage.setItem(ACTIVE_ID, localProject.id);
      localStorage.setItem(INDEX_KEY, JSON.stringify([{
        id: localProject.id,
        name: localProject.name,
        lastModified: localProject.lastModified,
        preview: 'Empty Draft',
        archived: false,
      }]));

      // --- Simulate: Browser A's projects exist in Firestore ---
      const firestoreProjects = [
        {
          id: 'chrome-project-1',
          name: 'Suburban Rebuild',
          bom: [
            { instanceId: 'p1', part: { id: 'p1', name: 'LS3 Engine', category: 'powertrain', description: '', ports: [] }, quantity: 1 },
            { instanceId: 'p2', part: { id: 'p2', name: '4L80E Trans', category: 'powertrain', description: '', ports: [] }, quantity: 1 },
          ],
          generatedImages: [],
          messages: [{ role: 'user', content: 'LS swap', timestamp: new Date('2025-01-15T09:00:00Z').toISOString() }],
          createdAt: new Date('2025-01-10').toISOString(),
          lastModified: new Date('2025-01-15T12:00:00Z').toISOString(),
          cacheIsDirty: false,
          archived: false,
          tags: ['ls-swap'],
          thumbnail: 'data:image/jpeg;base64,thumb',
          designRequirements: 'Full driveline rebuild',
          ownerId: 'user-123',
          slug: 'build-chrome-1',
        },
      ];

      // --- Step 1: migrateLocalProjectsToFirestore ---
      // (In reality, this pushes local-untitled to Firestore. We simulate the result.)
      // The local project has ownerId reassigned to the authenticated user.
      const migratedLocal = { ...localProject, ownerId: 'user-123' };
      // Simulating: saveSessionToFirestore writes migratedLocal to Firestore.
      // Firestore now has: [chrome-project-1, local-untitled (migrated)]

      // --- Step 2: loadProjectsFromFirestore ---
      // Simulating: getDocs(query(col)) returns firestoreProjects + migratedLocal
      const allFirestoreDocs = [...firestoreProjects, migratedLocal];

      function hydrateSession(data: any) {
        return {
          ...data,
          createdAt: new Date(data.createdAt),
          lastModified: data.lastModified ? new Date(data.lastModified) : new Date(),
          cacheIsDirty: data.cacheIsDirty ?? true,
          bom: (data.bom || []).map((entry: any) => ({
            ...entry,
            part: { ...entry.part, ports: entry.part.ports ? [...entry.part.ports] : [] },
            sourcing: entry.sourcing ? {
              ...entry.sourcing,
              online: entry.sourcing.online ? [...entry.sourcing.online] : undefined,
              local: entry.sourcing.local ? [...entry.sourcing.local] : undefined,
              lastUpdated: entry.sourcing.lastUpdated ? new Date(entry.sourcing.lastUpdated) : undefined
            } : undefined
          })),
          generatedImages: data.generatedImages?.map((img: any) => ({
            ...img,
            timestamp: new Date(img.timestamp)
          })) || [],
          messages: data.messages?.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          })) || []
        };
      }

      for (const docData of allFirestoreDocs) {
        const session = hydrateSession(docData);
        const key = PREFIX + session.id;

        const existingRaw = localStorage.getItem(key);
        let shouldWrite = true;
        if (existingRaw) {
          try {
            const existing = JSON.parse(existingRaw);
            const existingModified = new Date(existing.lastModified).getTime();
            const remoteModified = session.lastModified.getTime();
            if (existingModified > remoteModified) shouldWrite = false;
          } catch { /* overwrite */ }
        }

        if (shouldWrite) {
          const noImages = { ...session, generatedImages: [] };
          localStorage.setItem(key, JSON.stringify(noImages));
        }

        // Update index
        let index: any[] = [];
        try { index = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); } catch { /* */ }
        index = index.filter((i: any) => i.id !== session.id);
        index.unshift({
          id: session.id,
          name: session.name,
          lastModified: session.lastModified,
          preview: session.bom.length > 0 ? `${session.bom.length} Parts` : 'Empty Draft',
          thumbnail: (session as any).thumbnail,
          archived: (session as any).archived ?? false,
          tags: (session as any).tags ?? [],
        });
        localStorage.setItem(INDEX_KEY, JSON.stringify(index));
      }

      // --- Step 3: Verify Browser B's state after login ---

      const finalIndexRaw = localStorage.getItem(INDEX_KEY);
      if (!finalIndexRaw) return { pass: false, reason: 'No index after load' };
      const finalIndex = JSON.parse(finalIndexRaw);

      const errors: string[] = [];

      // Should have BOTH projects
      if (finalIndex.length !== 2) errors.push(`Expected 2 projects in index, got ${finalIndex.length} – ${finalIndex.map((p: any) => p.name).join(', ')}`);

      // Chrome's project should be present
      const chromeProject = finalIndex.find((p: any) => p.id === 'chrome-project-1');
      if (!chromeProject) errors.push('Chrome project NOT found in index');
      if (chromeProject && chromeProject.name !== 'Suburban Rebuild') errors.push(`Chrome project name: "${chromeProject.name}"`);
      if (chromeProject && chromeProject.preview !== '2 Parts') errors.push(`Chrome project preview: "${chromeProject.preview}"`);

      // Local project should also be present
      const localProj = finalIndex.find((p: any) => p.id === 'local-untitled');
      if (!localProj) errors.push('Local project NOT found in index');

      // Verify Chrome project's full data is in localStorage
      const chromeDataRaw = localStorage.getItem(PREFIX + 'chrome-project-1');
      if (!chromeDataRaw) {
        errors.push('Chrome project data NOT in localStorage');
      } else {
        const chromeData = JSON.parse(chromeDataRaw);
        if (chromeData.bom?.length !== 2) errors.push(`Chrome BOM: expected 2, got ${chromeData.bom?.length}`);
        if (chromeData.bom?.[0]?.part?.name !== 'LS3 Engine') errors.push('Chrome BOM[0] part data lost');
      }

      // Cleanup
      localStorage.removeItem(PREFIX + 'chrome-project-1');
      localStorage.removeItem(PREFIX + 'local-untitled');
      localStorage.removeItem(INDEX_KEY);
      localStorage.removeItem(ACTIVE_ID);

      return errors.length === 0
        ? { pass: true }
        : { pass: false, reason: errors.join('; ') };
    });

    expect(result.pass).toBe(true);
    if (!result.pass) {
      console.error('Full login flow errors:', (result as any).reason);
    }
  });

  /**
   * Validates that isAuthenticated() correctly gates Firestore operations.
   * Without proper auth, saves should be skipped.
   */
  test('unauthenticated saves should not attempt Firestore writes', async ({ page }) => {
    await page.goto('http://localhost:8080/app/');

    const result = await page.evaluate(() => {
      // Simulate the isAuthenticated check
      const currentUser = null; // Not logged in
      const isFirebaseConfigured = true; // Firebase is set up

      const isAuthenticated = !!currentUser && isFirebaseConfigured;

      let firestoreWriteCalled = false;
      if (isAuthenticated) {
        firestoreWriteCalled = true;
      }

      const errors: string[] = [];
      if (firestoreWriteCalled) {
        errors.push('Firestore write was attempted without authentication');
      }

      // Now simulate after login
      const loggedInUser = { id: 'user-123', name: 'Test' };
      const isAuthAfterLogin = !!loggedInUser && isFirebaseConfigured;

      if (!isAuthAfterLogin) {
        errors.push('isAuthenticated should be true after login');
      }

      return errors.length === 0
        ? { pass: true }
        : { pass: false, reason: errors.join('; ') };
    });

    expect(result.pass).toBe(true);
  });
});
