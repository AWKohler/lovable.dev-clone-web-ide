# Agent Guidelines

## Build/Lint/Test Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run start` - Start production server
- No test runner configured (no Jest/Vitest)

## Code Style
- **TypeScript**: Strict mode enabled, target ES2017
- **Imports**: Use `@/` alias for src/ imports
- **Styling**: Tailwind CSS with `cn()` utility for class merging
- **Components**: Use forwardRef for UI components, interface props
- **Naming**: PascalCase for components, camelCase for functions/variables
- **Error Handling**: Use try/catch with console.error for logging
- **Formatting**: Follow ESLint config (Next.js + TypeScript rules)
- **Structure**: Next.js App Router with server components by default