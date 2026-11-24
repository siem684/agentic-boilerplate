# Security policy

## Reporting a vulnerability

Please report it privately, not in a public issue or PR. Use GitHub's private vulnerability reporting: on the repository page, open the Security tab and choose "Report a vulnerability". Say what you found, how to reproduce it and what you think an attacker gains.

There is no fixed response time. Reports are read by the maintainer as soon as possible.

## What is in scope

- The scripts, hook, settings, agents and workflows in this template: for example a way around the protected paths, a workflow that exposes a secret, or a script that writes outside the project.
- The way the template wires `claude-code-action` and its permissions.

## What is not

- Vulnerabilities in BMAD, graphify, `claude-code-action` or GitHub itself: report them to those projects.
- Behaviour that is already listed as a known gap in the [security model](docs/agentic/security-model.md), for example that the Bash hook is best effort or that budget caps alert after a run. A better way to close one of these gaps is a welcome contribution: open an issue or a PR.

## How the setup is meant to be secure

The [security model](docs/agentic/security-model.md) describes the assets, who can start the agent and spend the API key, the controls, and the known gaps.
