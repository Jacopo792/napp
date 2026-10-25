# Cancellazione account – contratto operativo

Aggiornato il 24 ottobre 2026. Sostituisce il precedente contratto delle sole
richieste: `requestAccountDeletion` e `loadAccountDeletionRequest` non esistono più.
La RPC delle vecchie richieste non è più eseguibile dal client.

## Client mobile, web e desktop

```ts
import { eraseAccount } from "@/lib/accountDeletion";
import { purgeErasedAccount } from "@/lib/erasureLocal";

// Solo dopo conferma esplicita, mostrando email e conseguenze.
// Conservare lo stesso UUID v4 per ritentare dopo una risposta persa.
const receipt = await eraseAccount(session.userId, password, requestToken);
await purgeErasedAccount(session.userId);
// Disconnettere solo se l'account attualmente aperto è ancora quello eliminato.
```

La password è verificata nuovamente sul server con un client Auth separato.
`expected_user_id` impedisce di cancellare un altro account durante uno switch.
`processing` indica una procedura durevole già iniziata; `completed` conferma
anche la rimozione dell'identità. Entrambi richiedono l'uscita dall'account.
Un errore senza ricevuta non deve essere presentato come successo.

`accountErasureStatus(token)` usa una ricevuta casuale, valida sette giorni,
anche dopo la rimozione dell'account. `eraseAccountWithPassword(email,password,token)`
serve la pagina esterna `https://jacopo792.github.io/napp/?action=delete-account`
senza installare l'app o sostituire la sessione aperta.

Le interfacce sono implementate in Impostazioni → Account sul mobile e nelle
impostazioni profilo web/desktop. Non confondere la cancellazione con la sola
rimozione di un account dal dispositivo.

## Politica concordata con Jacopo

Vengono eliminati identità, profilo, preferenze, commenti, note proprie anche
condivise, documenti binari Yjs e cronologia delle proprie note, allegati non
necessari a documenti conservati, avatar, inviti e appartenenze. Gli archivi
rimasti senza membri vengono rimossi. Un archivio con altri membri resta.

**Restano i documenti creati da altre persone**, comprese modifiche e file
necessari a quei documenti. Gli identificativi dell'account vengono rimossi
dagli array di menzioni/autori e dai riferimenti non necessari. Non promettere
la rimozione selettiva delle parole scritte nei documenti altrui.

La pulizia locale riguarda sessioni salvate, snapshot, preferenze di consenso,
cache note/immagini/avatar e connessioni Yjs dell'account. È best effort: copie
esportate e dispositivi offline non possono essere cancellati a distanza.

## Backend pubblicato

Migrazioni `20261024010000`–`20261024060000` applicate al progetto collegato;
funzione Edge `delete-account` pubblicata. La funzione autentica esplicitamente
il bearer token e la password: `verify_jwt=false` non significa accesso anonimo
alla cancellazione. Le RPC operative sono riservate al service role.

La transazione prepara un manifesto Storage; il worker rimuove gli oggetti
tramite Storage API, conferma i batch ed elimina Auth soltanto alla fine.
Tombstone impediscono di ricreare note e percorsi eliminati con vecchi client.
La coda riprende ogni minuto tramite pg_cron/pg_net; credenziali solo in Vault.
Non cancellare righe `storage.objects` direttamente tramite SQL.

## Verifiche ripetibili

```sh
pnpm test
node scripts/verify-account-erasure.mjs --remote-fixtures
node scripts/verify-store-safety.mjs --remote-fixtures
node scripts/moderate-reports.mjs --erasures
```

I due script remoti creano e rimuovono solo proprie fixture. Non selezionano
utenti reali come bersagli. Le credenziali amministrative sono caricate in
memoria dalla CLI Supabase autenticata, mai stampate o incluse nelle build.

Il test PostgreSQL locale riproduce le migrazioni e i ruoli RLS con PGlite.
Quello remoto verifica anche Auth, file reali e il worker effettivamente
pubblicato. La preparazione completa agli store resta tracciata in
[store-release-readiness.md](store-release-readiness.md).

## Coordinamento mobile

Claude lavora contemporaneamente sul mobile. Le nuove schermate e i moduli core
sono già integrati; preservare le sue modifiche alle preferenze e al consenso
memorizzato per account. Con Expo SDK 58 `prebuild` ricrea i progetti per default:
usare `pnpm exec expo prebuild --no-clean --no-install` per aggiornamenti senza
ricreare cache e progetti nativi. La configurazione versionata resta la fonte.

Expo unisce le categorie privacy al file già generato: quando si rimuove una
categoria dalla configurazione, rigenerare il solo `PrivacyInfo.xcprivacy`
generato prima del prebuild (la dichiarazione completa è in `app.config.ts`),
poi controllare il manifest effettivamente copiato nella build.
