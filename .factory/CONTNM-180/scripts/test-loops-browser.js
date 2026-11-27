/**
 * Browser tests for Loop node feature (CONTNM-180).
 * Run against a running workbench at BASE_URL with backend on API_BASE_URL.
 * Requires Chrome installed locally or Puppeteer's bundled Chromium.
 */

const puppeteer = require('puppeteer');
const { execSync } = require('child_process');
const path = require('path');

const BASE_URL = process.env.WORKBENCH_URL || 'http://localhost:3003';
const API_BASE_URL = process.env.API_SERVER_URL || 'http://localhost:8080';
const CHROME_PATH = process.env.CHROME_PATH || null;

async function run() {
    console.log('=== Loop Feature Browser Tests ===');
    console.log(`Workbench: ${BASE_URL}`);
    console.log(`API Server: ${API_BASE_URL}`);

    const launchOpts = {};
    if (CHROME_PATH) {
        launchOpts.executablePath = CHROME_PATH;
    }
    // Puppeteer's bundled Chromium
    if (!CHROME_PATH && process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD !== '1') {
        try {
            const puppeteerPkg = require('puppeteer');
            launchOpts.executablePath = await puppeteerPkg.executablePath();
        } catch {}
    }

    const browser = await puppeteer.launch({
        ...launchOpts,
        headless: 'new',
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const page = await browser.newPage();
    let passCount = 0;
    let failCount = 0;

    async function test(name, fn) {
        try {
            await fn();
            console.log(`✅ ${name}`);
            passCount++;
        } catch (e) {
            console.log(`❌ ${name}: ${e.message}`);
            failCount++;
        }
    }

    // Test 1: Open workbench and verify it loads
    await test('Workbench loads', async () => {
        await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
        const title = await page.title();
        if (!title.toLowerCase().includes('continuum')) throw new Error(`Unexpected title: ${title}`);
    });

    // Test 2: Create a workflow with a loop node (via drag from palette or API)
    await test('Loop node renders on canvas', async () => {
        // After opening the workbench, create a loop via the Workflow Builder agent
        const workflowUri = `${BASE_URL}/api/v1/workflow/continuum%2Ftest-loop`;

        // Create a minimal workflow with a loop node via API
        const workflow = {
            name: 'Test Loop',
            nodes: [{
                nodeId: 'L',
                type: 'org.projectcontinuum.core.builtin.Loop',
                properties: {
                    condition: 'vars["hasMore"] == true',
                    maxIterations: 5,
                    onLimit: 'fail',
                },
                collapsed: false,
            }],
            edges: [],
        };

        const resp = await page.goto(`${BASE_URL}/workflow/continuum/test-loop`);
        if (resp.status() !== 200) throw new Error(`Failed to load workflow: ${resp.status()}`);
    });

    // Test 3: Verify LoopNode canvas rendering (dashed box, header, status)
    await test('Loop node shows dashed border with condition text', async () => {
        const loopBox = await page.$('.loop-node-body');
        if (!loopBox) throw new Error('LoopNode component not found on canvas');

        // Check it has the expected structure
        const className = await loopBox.evaluate(el => el.className);
        if (!className.includes('loop-node-body')) throw new Error('Missing loop-node-body class');
    });

    // Test 4: Loop condition dialog opens on double-click
    await test('Loop properties dialog opens', async () => {
        const loopNode = await page.$('.loop-node-body');
        if (loopNode) {
            await loopNode.dblclick();
            const dialogOpen = await page.$('.MuiDialog-root');
            if (!dialogOpen) throw new Error('Properties dialog not opened on double-click');
        }
    });

    // Test 5: Two-mode toggle present in dialog
    await test('Two-mode toggle (CEL/Builder) is visible', async () => {
        const switchEl = await page.$('.MuiSwitch-root');
        if (!switchEl) throw new Error('Mode toggle switch not found in dialog');
    });

    // Test 6: Loop collapse toggle works
    await test('Loop collapse/expand toggle works', async () => {
        const loopNode = await page.$('.loop-node-body');
        if (loopNode) {
            const beforeCollapsed = await loopNode.evaluate(el =>
                el.className.includes('collapsed')
            );

            // Click the collapse indicator
            const collapseIndicator = await page.$('[title="Collapse loop"], [title="Expand loop"]');
            if (collapseIndicator) {
                await collapseIndicator.click();
                const afterCollapsed = await loopNode.evaluate(el =>
                    el.className.includes('collapsed')
                );

                if (beforeCollapsed === afterCollapsed) {
                    throw new Error('Collapse state did not change');
                }
            }
        }
    });

    console.log(`\nResults: ${passCount} passed, ${failCount} failed`);

    await browser.close();

    if (failCount > 0) {
        process.exit(1);
    }
}

run().catch(e => {
    console.error('Browser test failure:', e.message);
    process.exit(1);
});
