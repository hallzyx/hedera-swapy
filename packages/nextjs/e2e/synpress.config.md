# Synpress MetaMask path

Playwright MCP is **not** used. Synpress drives a real MetaMask extension in Chromium.

## Setup (local)

1. Install Synpress in this workspace when you are ready to automate MetaMask:

   ```bash
   yarn workspace @sh/nextjs add -D @synthetixio/synpress
   ```

2. Create a **testnet-only** MetaMask seed / private key. Never commit it.

3. Point Synpress at Hedera Testnet RPC `https://testnet.hashio.io/api` (chain id `296`).

4. Run:

   ```bash
   SYNPRESS_ENABLED=1 yarn e2e:synpress
   ```

## Covered journeys

1. Connect MetaMask via RainbowKit.
2. Enter `999` HBAR → `policy-reject` visible, submit disabled.
3. Enter `1` HBAR → `policy-accept` visible, quote populated.
4. (Optional, funded) Associate SAUCE + confirm swap; assert HashScan link.

The default CI path is `yarn e2e:policy`, which covers policy + intent without MetaMask.
