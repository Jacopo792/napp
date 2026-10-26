# Gestione abusi – da attivare prima del lancio

Responsabile indicato: Jacopo Vincenzo Ansalone. Contatto pubblico:
ansalonejacpo@gmail.com. Il codice non invia email né notifiche automatiche ai
moderatori: una coda implementata richiede una persona che la controlli.

Prima del lancio concordare e attivare un controllo almeno quotidiano, con
presa in carico degli abusi entro 24 ore e priorità alle minacce e allo
sfruttamento di minori. Non dichiarare questo servizio operativo finché la
copertura non è effettivamente assicurata.

## Strumenti amministrativi

Eseguire dalla radice del repository con CLI Supabase autenticata. Le chiavi
service role restano in memoria e non devono essere copiate nel client.

```sh
node scripts/moderate-reports.mjs --queue
node scripts/moderate-reports.mjs --show UUID_SEGNALAZIONE
node scripts/moderate-reports.mjs --hide UUID_SEGNALAZIONE
node scripts/moderate-reports.mjs --dismiss UUID_SEGNALAZIONE
node scripts/moderate-reports.mjs --erasures
```

`--show` contiene dati privati: non incollarli in issue pubbliche, log CI o
chat. `--hide` sottrae l'intera nota a tutti i client sotto RLS; `--dismiss`
chiude una segnalazione senza aggiungere un divieto globale. Non usare
`--dismiss` come comando di ripristino di una nota già nascosta. Per account
recidivi usare le funzioni amministrative Auth, verificando anche il canale di
richiesta cancellazione per un account sospeso. Il client non può eseguire
azioni di moderazione amministrativa.

Una segnalazione in attesa nasconde la nota solo al segnalante; il moderatore
valuta anche testo e allegati della copia segnalata. Il blocco è bidirezionale
per visibilità di note/commenti e inviti, ma non rimuove appartenenze esistenti
né documenti creati da un terzo. Le interfacce descrivono questo limite.

Rimuovere contenuti vietati dopo verifica, documentare privatamente la decisione
e rispondere alle richieste arrivate al contatto pubblico. Non scaricare o
redistribuire materiale illecito per la verifica; applicare la procedura
appropriata alle segnalazioni di sfruttamento e alle richieste delle autorità.

## Cancellazioni bloccate e conservazione

`--erasures` mostra solo il numero di job pendenti. Il worker ritenta ogni
minuto; una coda che resta non vuota richiede controllo dei log Edge e degli
esiti pg_net, senza esportare password o segreti Vault. Non eliminare Auth
manualmente prima dei file e non cancellare direttamente righe Storage.

Le ricevute casuali scadono dopo sette giorni. I report in attesa restano fino
alla revisione; quelli già rivisti vengono rimossi automaticamente dopo novanta
giorni, prima se l'account o il contenuto collegato vengono cancellati. Il
filtro di un contenuto confermato resta anche dopo la scadenza del report.
Le copie di backup e i log richiedono scadenze operative verificate, ancora da
confermare.
