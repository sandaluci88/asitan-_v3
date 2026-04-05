// ─── Mock Memory Store ───────────────────────────────────────────────────────
// In-memory array store for testing without SQLite.

export interface MockMemory {
    id: number;
    content: string;
    source: string;
    created_at: string;
}

const mockStore: MockMemory[] = [];
let nextId = 1;

export function mockSaveMemory(content: string, source: string = 'user'): MockMemory {
    const mem: MockMemory = {
        id: nextId++,
        content,
        source,
        created_at: new Date().toISOString(),
    };
    mockStore.push(mem);
    return mem;
}

export function mockSearchMemories(query: string, topK: number = 5): MockMemory[] {
    const lower = query.toLowerCase();
    return mockStore
        .filter((m) => m.content.toLowerCase().includes(lower))
        .slice(0, topK);
}

export function mockListRecent(n: number = 10): MockMemory[] {
    return [...mockStore].reverse().slice(0, n);
}

export function mockMemoryCount(): number {
    return mockStore.length;
}

export function mockReset(): void {
    mockStore.length = 0;
    nextId = 1;
}

// ─── Standalone Test ─────────────────────────────────────────────────────────
// Run with: npx tsx src/memory/mock.ts

const isMainModule = process.argv[1]?.endsWith('mock.ts') || process.argv[1]?.endsWith('memory/mock');
if (isMainModule) {
    console.log('Testing mock memory store...\n');
    let pass = 0;
    let fail = 0;

    function assert(label: string, condition: boolean) {
        if (condition) {
            console.log(`  PASS ${label}`);
            pass++;
        } else {
            console.error(`  FAIL ${label}`);
            fail++;
        }
    }

    // Test 1: Save
    mockReset();
    const m1 = mockSaveMemory('I prefer dark mode', 'user');
    assert('Save returns id=1', m1.id === 1);
    assert('Save returns correct content', m1.content === 'I prefer dark mode');

    // Test 2: Save another
    const m2 = mockSaveMemory('My timezone is CET', 'agent');
    assert('Second save returns id=2', m2.id === 2);

    // Test 3: Search
    const results = mockSearchMemories('dark');
    assert('Search "dark" returns 1 result', results.length === 1);
    assert('Search result matches', results[0].content === 'I prefer dark mode');

    // Test 4: Search no results
    const noResults = mockSearchMemories('nonexistent');
    assert('Search "nonexistent" returns 0 results', noResults.length === 0);

    // Test 5: List recent
    const recent = mockListRecent(5);
    assert('List recent returns 2', recent.length === 2);
    assert('Most recent first', recent[0].id === 2);

    // Test 6: Count
    assert('Count is 2', mockMemoryCount() === 2);

    // Test 7: Reset
    mockReset();
    assert('Reset clears store', mockMemoryCount() === 0);

    console.log(`\nResults: ${pass} passed, ${fail} failed`);
    if (fail > 0) process.exit(1);
}
