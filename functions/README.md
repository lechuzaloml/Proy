# Firebase Functions

The public copy flow stores immutable snapshots under
`empresas/{empresaId}/cuestionarios/{cuestionarioId}/versiones/{versionId}`.
Publishing is performed by the client in one Firestore batch: it creates a
version with its number, configuration, server publication timestamp, and
creator, then updates the questionnaire's `estado` and `versionActualId`.
Unpublishing changes the questionnaire's state to `borrador`. The public page
reads the questionnaire and then the version identified by `versionActualId`.

Public submissions are written directly by the browser in one Firestore batch:
the visitor's lead and diagnosis use the same ID and are authorized by
`firestore.rules` only while the company is active and the questionnaire version
is the currently published version. The browser calculates the result with the
existing questionnaire engine and uses Firestore server timestamps for consent
and completion.

The `enviarCopiaPublicada` callable remains in this folder but is not used by
the public visitor flow. It must remain unused until the project has the Blaze
plan; do not add it back to the visitor flow while Cloud Functions are not
available.

Run `npm test` in this directory for validation and authorization unit tests.
Run `npm run test:rules` from the project root to start the isolated Firestore
Emulator and test client publication batches and public-access rules. The
callable functions use `us-central1`; do not point tests at a production
project.

For local manual testing, use a non-production Firebase project configuration
and connect the web app to the Firestore Emulator before testing publication or
anonymous public submissions. No Auth or Functions emulator is required for
the public visitor flow.

After reviewing function and Firestore rules tests, deploy only when explicitly
approved with:

```powershell
firebase deploy --only functions,firestore:rules
```

The expected public URL is `/c/{empresaId}/{cuestionarioId}`. The URL resolves
to the current version, so it remains stable across publications. Unpublishing
disables public reads and submissions for the active version. Historical
version documents remain immutable and are not exposed by Firestore rules after
unpublishing or a newer publication.
