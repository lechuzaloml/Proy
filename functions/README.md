# Firebase Functions

The public copy flow stores immutable snapshots under
`empresas/{empresaId}/cuestionarios/{cuestionarioId}/versiones/{versionId}`.
Public submissions go through `enviarCopiaPublicada`, which checks that the
snapshot is still the active publication, validates consent and answers,
calculates the result on the server, and creates the lead/diagnosis pair in one
Firestore transaction. The callable does not return or expose lead data.

Run `npm test` in this directory for validation and authorization unit tests.
Run `npm run test:rules` from the project root to start the isolated Firestore
Emulator and test the atomic backend write together with Firestore rules. The
callable functions use `us-central1`; do not point tests at a production
project.

For local manual testing, build the function package with
`npm --prefix functions run build`, then start the Auth, Firestore, and
Functions emulators. The web app must use a non-production Firebase project
configuration and connect to those emulators before testing publication or
anonymous submissions.

After reviewing function and Firestore rules tests, deploy only when explicitly
approved with:

```powershell
firebase deploy --only functions,firestore:rules
```

The expected public URL is `/c/{empresaId}/{cuestionarioId}/{versionId}`. Each
publication creates a new version URL; unpublishing disables public reads and
submissions for the active version. Historical version documents remain
immutable and are not exposed by Firestore rules after unpublishing or a newer
publication.
