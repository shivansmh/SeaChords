UI redesign tools must not modify this folder.

This directory owns the framework-independent musical rules, gesture classification, controller state, audio scheduling, and vision adapters. Keep React components, DOM rendering, layout, and presentation state in `src/ui`, `src/hooks`, or the application entry point. Protect musical behavior with Vitest tests before changing the engine.
