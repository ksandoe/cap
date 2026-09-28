# AWS Amplify — Frontend deployments

Two separate Amplify apps share one backend (API Gateway + Lambda).

## Student App
- **Repo path**: packages/frontend-student
- **Build command**: `npm run build:student`
- **Output**: packages/frontend-student/dist
- **Port (dev)**: 3000
- **Environment variables**:
  - VITE_API_BASE_URL = <API Gateway URL>
- **Access**: LTI launch only — no direct URL for students

## Admin App
- **Repo path**: packages/frontend-admin
- **Build command**: `npm run build:admin`
- **Output**: packages/frontend-admin/dist
- **Port (dev)**: 3002
- **Environment variables**:
  - VITE_API_BASE_URL = <API Gateway URL>
- **Access**: Direct URL, role-based login (institutional SSO in production)

## amplify.yml (place in repo root)
```yaml
version: 1
applications:
  - appRoot: packages/frontend-student
    frontend:
      phases:
        preBuild:
          commands: [cd ../../ && npm install]
        build:
          commands: [npm run build:student]
      artifacts:
        baseDirectory: dist
        files: ['**/*']

  - appRoot: packages/frontend-admin
    frontend:
      phases:
        preBuild:
          commands: [cd ../../ && npm install]
        build:
          commands: [npm run build:admin]
      artifacts:
        baseDirectory: dist
        files: ['**/*']
```
