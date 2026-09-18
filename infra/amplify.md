# AWS Amplify — Frontend deployment

- **Framework:** Vite + React
- **Build command:** `npm run build -w packages/frontend`
- **Build output:** `packages/frontend/dist`
- **Environment variables:** Set VITE_API_BASE_URL to the API Gateway URL

## amplify.yml (place in repo root)
```yaml
version: 1
applications:
  - frontend:
      phases:
        preBuild:
          commands:
            - npm install
        build:
          commands:
            - npm run build -w packages/frontend
      artifacts:
        baseDirectory: packages/frontend/dist
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
```
