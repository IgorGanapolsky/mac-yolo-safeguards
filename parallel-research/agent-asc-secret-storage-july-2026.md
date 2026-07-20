For storing AI agent Apple ID passwords on macOS, both the macOS Keychain and 1Password CLI offer secure solutions, though they cater to different needs.

**macOS Keychain** is an operating system-level credential store that encrypts secrets using hardware-backed keys managed by the Secure Enclave. Accessing these secrets requires authentication, such as Touch ID or a user password. It's suitable for storing API keys and other local development secrets, and can be accessed via the `security` command-line tool. However, it may not offer the same breadth of features or cross-platform compatibility as dedicated password managers.

**1Password CLI** is designed for developers and offers robust secret management. It allows for secure access to credentials during development, enabling the injection of secrets from 1Password Environments without exposing them in plaintext in code. It supports fingerprint authentication for signing in and can store API keys for various CLIs. 1Password CLI also offers features like team key sharing and can integrate with AI coding agents.

**Obsidian** is primarily a note-taking application and is not designed for secure password storage for AI agents or Apple ID passwords. There is no information in the provided search results to suggest its use for this purpose.

Regarding the retrieval of credentials without plaintext, both macOS Keychain and 1Password CLI aim to achieve this. macOS Keychain's `security` command can find generic passwords, and 1Password CLI allows for secure injection of secrets. For AI agents, tools like 'AI KeyChain' leverage the macOS Keychain to provide proxy modes where keys are not visible in the environment.

Information regarding ASC API .p8 files in comparison to Apple ID passwords is not available in the provided search results.