// @ts-ignore
import {ApiPromise, WsProvider} from 'https://cdn.jsdelivr.net/npm/@polkadot/api@10.5.1/+esm';
// @ts-ignore
import {web3Accounts, web3Enable} from 'https://cdn.jsdelivr.net/npm/@polkadot/extension-dapp@0.46.2/+esm';
// @ts-ignore
import {Bytes, Signer, Sr25519Signature, u16, u64} from 'https://cdn.jsdelivr.net/npm/@polkadot/types@10.5.1/+esm';
// @ts-ignore
import {Keyring, KeyringPair} from 'https://cdn.jsdelivr.net/npm/@polkadot/keyring@12.1.2/+esm'
// @ts-ignore
import {InjectedAccountWithMeta} from "https://cdn.jsdelivr.net/npm/@polkadot/extension-inject@0.46.3/+esm";
// @ts-ignore
import {options} from "https://cdn.jsdelivr.net/npm/@frequency-chain/api-augment@1.6.1/+esm";

import {
    domActionsSelectors,
    clearFormInvalid,
    getHTMLInputValue,
    getSelectedOption,
    listenForExtrinsicsChange,
    setVisibility,
    validateForm,
    setProgress,
    callAndRegisterProviderChangeEvent,
    setConnectionProgress,
} from "./domActions.js";

import {
    getCreateSponsoredAccountFormData,
    getGrantDelegationFormData,
    getApplyItemActionsWithSignatureFormData,
    getAddPublicKeyFormData,
    getClaimHandleFormData,
    getUpsertPageFormData,
    getDeletePageWithSignatureFormData,
} from "./formApiActions.js";

import {
    getBlockNumber,
    signPayloadWithExtension,
    signPayloadWithKeyring,
    submitExtrinsicWithExtension,
    submitExtrinsicWithKeyring,
} from "./chainActions.js";

// const Hash = interfaces.Hash;

let PREFIX = 42;
let UNIT = "UNIT";

type AnySigner = KeyringPair | InjectedAccountWithMeta;

let singletonApi: ApiPromise;
let singletonProvider: WsProvider;
let providerName: string;
let validAccounts: Record<string, AnySigner> = {};
let registeredEvents: Record<string, any> = {};

type EventHandler = (e: Event) => Promise<void>;

//  map of form submit button ids to event handlers.
let formListeners: Record<string, EventHandler> = {
    'create_msa_button': createMsa,
    'handles_claim_handle_sign_button': signClaimHandle,
    'handles_claim_handle_submit_button': submitClaimHandle,
    'msa_create_sponsored_account_with_delegation_sign_button': signCreateSponsoredAccountWithDelegation,
    'msa_create_sponsored_account_with_delegation_submit_button': submitCreateSponsoredAccountWithDelegation,
    'msa_grant_delegation_sign_button': signGrantDelegation,
    'msa_grant_delegation_submit_button': submitGrantDelegation,
    'add_public_key_to_msa_sign_button': signAddPublicKeyToMsa,
    'add_public_key_to_msa_submit_button': submitAddPublicKeyToMsa,
    'apply_item_actions_with_signature_sign_button': signApplyItemActionsWithSignature,
    'apply_item_actions_with_signature_submit_button': submitApplyItemActionsWithSignature,
    'upsert_page_with_signature_sign_button': signUpsertPageWithSignature,
    'upsert_page_with_signature_submit_button': submitUpsertPageWithSignature,
    'delete_page_with_signature_sign_button': signDeletePageWithSignature,
    'delete_page_with_signature_submit_button': submitDeletePageWithSignature,

};

const formSelectors = {
    deletePageForm: 'stateful_storage_delete_page_with_signature',
    upsertPageForm: 'stateful_storage_upsert_page_with_signature',
    applyItemActionsForm: 'stateful_storage_apply_item_actions_with_signature',
    grantDelegation: 'msa_grant_delegation',
    createMsaWithDelegationForm: 'msa_create_sponsored_account_with_delegation',
    addPublicKeyForm: 'msa_add_public_key_to_msa',
    claimHandleForm: 'handles_claim_handle',
}

const GENESIS_HASHES: Record<string, string> = {
    rococo: "0x0c33dfffa907de5683ae21cc6b4af899b5c4de83f3794ed75b2dc74e1b088e72",
    frequency: "0x4a587bf17a404e3572747add7aab7bbe56e805a5479c6c436f07f36fcc8d3ae1",
}

async function getApi(providerUri: string) {
    if (!providerUri) {
        throw new Error("Empty providerURI");
    }
    // Handle disconnects
    if (providerUri) {
        if (singletonApi) {
            await singletonApi.disconnect();
        } else if (singletonProvider) {
            await singletonProvider.disconnect();
        }
    }

    // Singleton Provider because it starts trying to connect here.
    singletonProvider = new WsProvider(providerUri);
    singletonApi = await ApiPromise.create({
        provider: singletonProvider,
        throwOnConnect: true,
        ...options,
    });
    return singletonApi;
}

function registerExtrinsicsButtonHandlers() {
    if (!registeredEvents['extrinsicsButtons']) {
        Object.keys(formListeners).forEach(elementId => {
            (document.getElementById(elementId) as HTMLElement).addEventListener('click', formListeners[elementId]);
        })
        registeredEvents['extrinsicsButtons'] = true;
    }
}

function showConnectedElements() {
    [
        'create_msa_form',
        'extrinsics_forms',
        'payload',
        'transaction-signing-address',
    ].forEach((elementId) => {
        setVisibility(elementId, true);
    });
}

async function updateConnectionStatus(api) {
    const chain = await api.rpc.system.properties();
    PREFIX = Number(chain.ss58Format.toString());
    UNIT = chain.tokenSymbol.toString();
    (document.getElementById("unit") as HTMLElement).innerText = UNIT;
    let blockNumber = await getBlockNumber(singletonApi);
    (document.getElementById("current-block") as HTMLElement).innerHTML = blockNumber.toString();
    (document.getElementById(domActionsSelectors.connectionStatus) as HTMLElement).innerText = "Connected"
}

// Connect to the wallet and blockchain
async function connect(event: Event) {
    event.preventDefault();
    setConnectionProgress(domActionsSelectors.connectButton, true);
    let selectedProvider = getSelectedOption(domActionsSelectors.providerList);
    let api;
    let provider = "";
    try {
        if (selectedProvider.id === domActionsSelectors.otherEndpointSelection) {
            providerName = getHTMLInputValue(domActionsSelectors.otherEndpointURL) || "";
            provider = providerName;
        } else {
            providerName = selectedProvider.getAttribute("name") || "";
            provider = selectedProvider.value;
        }
        api = await getApi(provider);
        await updateConnectionStatus(api);
        await loadAccounts();
        (document.getElementById("setup-extrinsic") as HTMLElement).setAttribute("class", "ready");
        showConnectedElements();
        resetForms()
        listenForExtrinsicsChange();
        registerExtrinsicsButtonHandlers();
    } catch(e: any) {
        console.error(e.toString());
        alert(`could not connect to ${provider || "empty value"}. Please enter a valid and reachable Websocket URL.`);
    } finally {
        setConnectionProgress(domActionsSelectors.connectButton, false);
    }
    return;
}

function populateDropdownWithAccounts(elementId: string) {
    let accountsSelect = document.getElementById(elementId) as HTMLSelectElement;
    accountsSelect.innerHTML = "";
    Object.keys(validAccounts).forEach( key => {
        const el = document.createElement("option") as HTMLOptionElement;
        const a =  validAccounts[key];
        el.setAttribute("value", a.address);
        el.setAttribute("name", a.address);
        el.innerText = `${a.meta.name}: ${a.address}`;
        accountsSelect.add(el);
    })


}

function loadTestAccounts() {
    const keyring = new Keyring({type: 'sr25519'});

    ['//Alice', '//Bob', '//Charlie', '//Dave', '//Eve', '//Ferdie'].forEach(accountName => {
        let account = keyring.addFromUri(accountName);
        account.meta.name = accountName;
        validAccounts[account.address] = account;
    })
}

async function loadExtensionAccounts() {
    let allAccounts = await web3Accounts();
    allAccounts.forEach(a => {
        // display only the accounts allowed for this chain
        if (!a.meta.genesisHash
            || GENESIS_HASHES[providerName] === a.meta.genesisHash) {
            validAccounts[a.address] = a;
        }
    });
}

async function anyPolkadotExtensions(): Promise<boolean> {
    const extensions = await web3Enable('Frequency parachain signer helper');
    return extensions.length > 0;
}

async function loadAccounts() {
    (document.getElementById("signing-address") as HTMLElement).innerHTML = "";

    // populating for localhost and for a parachain are different since with localhost, there is
    // access to the Alice/Bob/Charlie accounts etc., and so won't use the extension.
    validAccounts = {};
    if (providerName === "localhost") {
        loadTestAccounts();
    } else {
        if (!anyPolkadotExtensions()) {
            alert("Polkadot{.js} extension not found; please install it first.");
            return;
        }
        await loadExtensionAccounts();
    }

    // set options in the account dropdown.
    [
        'signing-address',
        'claim_handle_msaOwnerKey',
        'add_public_key_to_msa_new_key',
        'create_sponsored_account_with_delegation_delegator_key',
        'grant_delegation_delegator_key',
        'apply_item_actions_with_signature_delegator_key',
        'upsert_page_with_signature_delegator_key',
        'delete_page_with_signature_delegator_key',
    ].forEach(selectId => populateDropdownWithAccounts(selectId))
}

// TODO: move this into domActions
// resetForms puts the form state back to initial setup with first extrinsic selected and first form showing
function resetForms() {
    setVisibility(formSelectors.claimHandleForm, true);
    const selectedExtrinsic: HTMLOptionElement = getSelectedOption(domActionsSelectors.extrinsicsListId);

    const toBeCleared  = document.getElementsByClassName('clear_on_reset') as HTMLCollectionOf<HTMLInputElement>;
    for (let i=0; i<toBeCleared.length; i++) {
        const item = toBeCleared.item(i) as HTMLInputElement
        item.value = '';
    }

    const toBeDisabled = document.getElementsByClassName('disable_on_reset') as HTMLCollectionOf<HTMLInputElement>;
    for (let i=0; i<toBeDisabled.length; i++) {
        const item = toBeCleared.item(i) as HTMLInputElement
        item.disabled = false;
    }
    (document.getElementById(domActionsSelectors.connectionStatus) as HTMLElement).innerHTML="";

    if (selectedExtrinsic.value !== formSelectors.claimHandleForm) {
        setVisibility(selectedExtrinsic.value, false);
        selectedExtrinsic.selected = false;
    }
}

// createMSA
async function createMsa(event: Event) {
    event.preventDefault();
    let submitButtonId = (event.target as HTMLElement).id
    setProgress(submitButtonId, true);
    const signingKey = getSelectedOption('signing-address').value;
    const signingAccount = validAccounts[signingKey];
    const extrinsic = singletonApi.tx.msa.create();

    providerName === 'localhost' ?
        await submitExtrinsicWithKeyring(extrinsic, signingAccount as KeyringPair, () => setProgress(submitButtonId, false)):
        await submitExtrinsicWithExtension(extrinsic, signingAccount, signingKey, () => setProgress(submitButtonId, false));
    setProgress(submitButtonId, false)
}

async function signClaimHandle(event: Event) {
    event.preventDefault();
    if (!validateForm(formSelectors.claimHandleForm)) { return; }
    clearFormInvalid(formSelectors.claimHandleForm);

    const { signingKey, payload} = getClaimHandleFormData(singletonApi);
    const signingAccount = validAccounts[signingKey];

    // TODO: allow to claim handle by other account
    // const msaOwnerKey = getSelectedOption('claim_handle_msaOwnerKey').value;
    // const msaOwnerAccount = validAccounts[msaOwnerKey];

    const signature = providerName !== 'localhost' ?
        await signPayloadWithExtension(signingAccount as InjectedAccountWithMeta, signingKey, payload) :
        signPayloadWithKeyring(signingAccount as KeyringPair, payload);

    let signatureEl = document.getElementById('signed_payload') as HTMLTextAreaElement;
    signatureEl.value = signature;
}

async function submitClaimHandle(event: Event) {
    event.preventDefault();
    if (!validateForm(formSelectors.claimHandleForm)) { return; }
    clearFormInvalid(formSelectors.claimHandleForm);

    let submitButtonId = (event.target as HTMLElement).id
    setProgress(submitButtonId, true);


    const { signingKey, signatures, payload } = getClaimHandleFormData(singletonApi);
    const signingAccount = validAccounts[signingKey];
    const proof = { Sr25519: signatures[0] };
    const extrinsic = singletonApi.tx.handles.claimHandle(signingKey, proof, payload.toU8a());

    providerName === 'localhost' ?
        await submitExtrinsicWithKeyring(extrinsic, signingAccount as KeyringPair, () => setProgress(submitButtonId, false)):
        await submitExtrinsicWithExtension(extrinsic, signingAccount, signingKey, () => setProgress(submitButtonId, false));

}


// TODO: populate new MSA Owner key with a dropdown from available accounts
async function signAddPublicKeyToMsa(event: Event) {
    event.preventDefault();
    if (!validateForm(formSelectors.addPublicKeyForm)) { return; }
    clearFormInvalid(formSelectors.addPublicKeyForm);

    const { signingKey, delegatorKey, payload} = getAddPublicKeyFormData(singletonApi);

    const signingAccount = validAccounts[signingKey];
    const newAccount = validAccounts[delegatorKey];

    let ownerKeySignature: string;
    let newKeySignature: string;

    ownerKeySignature = providerName !== 'localhost' ?
        await signPayloadWithExtension(signingAccount as InjectedAccountWithMeta, signingKey, payload) :
        signPayloadWithKeyring(signingAccount as KeyringPair, payload);
    (document.getElementById('signed_payload') as HTMLTextAreaElement).value = ownerKeySignature;

    newKeySignature = providerName !== 'localhost' ?
        await signPayloadWithExtension(signingAccount as InjectedAccountWithMeta, signingKey, payload) :
        signPayloadWithKeyring(newAccount as KeyringPair, payload);
    (document.getElementById('signed_payload2') as HTMLTextAreaElement).value = newKeySignature;

}

async function submitAddPublicKeyToMsa(event: Event) {
    event.preventDefault();

    if (!validateForm(formSelectors.addPublicKeyForm)) { return; }
    clearFormInvalid(formSelectors.addPublicKeyForm);

    let submitButtonId = (event.target as HTMLElement).id
    setProgress(submitButtonId, true);

    const { signingKey, signatures, payload } = getAddPublicKeyFormData(singletonApi);
    const signingAccount = validAccounts[signingKey];

    const ownerKeyProof = { Sr25519: signatures[0] }
    const newKeyProof = { Sr25519: signatures[1] }
    const extrinsic = singletonApi.tx.msa.addPublicKeyToMsa(signingAccount.address, ownerKeyProof, newKeyProof, payload.toU8a());

    providerName === 'localhost' ?
        await submitExtrinsicWithKeyring(extrinsic, signingAccount as KeyringPair, () => setProgress(submitButtonId, false)):
        await submitExtrinsicWithExtension(extrinsic, signingAccount, signingKey, () => setProgress(submitButtonId, false));

    setProgress(submitButtonId, false)
}

async function signCreateSponsoredAccountWithDelegation(event: Event) {
    event.preventDefault();
    if (!validateForm(formSelectors.createMsaWithDelegationForm)) { return; }
    clearFormInvalid(formSelectors.createMsaWithDelegationForm);

    const delegatorKey = getHTMLInputValue('create_sponsored_account_with_delegation_delegator_key');
    const delegatorAccount = validAccounts[delegatorKey];

    const authorizedMsaId = parseInt(getHTMLInputValue('create_sponsored_account_with_delegation_provider'));
    const expiration = parseInt(getHTMLInputValue('create_sponsored_account_with_delegation_expiration'));
    const schemaIds = getHTMLInputValue('create_sponsored_account_with_delegation_schema_ids')
        .split(",")
        .map(item => parseInt(item.trim()));

    const rawPayload = { authorizedMsaId, expiration, schemaIds }
    const payload = singletonApi.registry.createType("PalletMsaAddProvider", rawPayload);

    const signature = providerName == 'localhost' ?
        signPayloadWithKeyring(delegatorAccount as KeyringPair, payload) :
        await signPayloadWithExtension(delegatorAccount as InjectedAccountWithMeta, delegatorKey, payload)

    let signatureEl = document.getElementById('signed_payload') as HTMLTextAreaElement;
    signatureEl.value = signature;
}

async function submitCreateSponsoredAccountWithDelegation(event: Event) {
    event.preventDefault();

    if (!validateForm(formSelectors.createMsaWithDelegationForm)) { return; }
    clearFormInvalid(formSelectors.createMsaWithDelegationForm);

    let submitButtonId = (event.target as HTMLElement).id
    setProgress(submitButtonId, true);

    const {signingKey, delegatorKey, signatures, payload} = getCreateSponsoredAccountFormData(singletonApi);
    const signingAccount = validAccounts[signingKey];

    const proof = {Sr25519: signatures[0]};
    const extrinsic = singletonApi.tx.msa.createSponsoredAccountWithDelegation(delegatorKey, proof, payload.toU8a())

    providerName === 'localhost' ?
        await submitExtrinsicWithKeyring(extrinsic, signingAccount as KeyringPair, () => setProgress(submitButtonId, false)):
        await submitExtrinsicWithExtension(extrinsic, signingAccount, signingKey, () => setProgress(submitButtonId, false));
    setProgress(submitButtonId, false)
}

async function signGrantDelegation(event: Event) {
    event.preventDefault()
    if (!validateForm(formSelectors.grantDelegation)) { return; }
    clearFormInvalid(formSelectors.grantDelegation);

    const {delegatorKey, payload} = getGrantDelegationFormData(singletonApi);
    const delegatorAccount = validAccounts[delegatorKey];

    const signature = providerName == 'localhost' ?
        signPayloadWithKeyring(delegatorAccount as KeyringPair, payload) :
        await signPayloadWithExtension(delegatorAccount as InjectedAccountWithMeta, delegatorKey, payload)

    let signatureEl = document.getElementById('signed_payload') as HTMLTextAreaElement;
    signatureEl.value = signature;
}

async function submitGrantDelegation(event: Event) {
    event.preventDefault();
    if (!validateForm(formSelectors.grantDelegation)) { return; }
    clearFormInvalid(formSelectors.grantDelegation);

    let submitButtonId = (event.target as HTMLElement).id
    setProgress(submitButtonId, true);

    const {signingKey, delegatorKey, signatures, payload} = getGrantDelegationFormData(singletonApi);

    const signingAccount = validAccounts[signingKey];
    const proof = { Sr25519: signatures[0] };

    const extrinsic = singletonApi.tx.msa.grantDelegation(delegatorKey, proof, payload.toU8a())

    providerName === 'localhost' ?
        await submitExtrinsicWithKeyring(extrinsic, signingAccount as KeyringPair, () => setProgress(submitButtonId, false)):
        await submitExtrinsicWithExtension(extrinsic, signingAccount, signingKey, () => setProgress(submitButtonId, false));
    setProgress(submitButtonId, false)
}

async function signApplyItemActionsWithSignature(event: Event) {
    event.preventDefault();
    if (!validateForm(formSelectors.applyItemActionsForm)) { return; }
    clearFormInvalid(formSelectors.applyItemActionsForm);

    const {delegatorKey, payload} = await getApplyItemActionsWithSignatureFormData(singletonApi);
    const delegatorAccount = validAccounts[delegatorKey];

    const signature = providerName == 'localhost' ?
        signPayloadWithKeyring(delegatorAccount, payload) :
        await signPayloadWithExtension(delegatorAccount, delegatorKey, payload)

    let signatureEl = document.getElementById('signed_payload') as HTMLTextAreaElement;
    signatureEl.value = signature;
}

async function submitApplyItemActionsWithSignature(event: Event) {
    event.preventDefault();
    if (!validateForm(formSelectors.applyItemActionsForm)) { return; }
    clearFormInvalid(formSelectors.applyItemActionsForm);

    let submitButtonId = (event.target as HTMLElement).id
    setProgress(submitButtonId, true);

    const {delegatorKey, payload, signatures} = await getApplyItemActionsWithSignatureFormData(singletonApi);

    const proof = { Sr25519: signatures[0] };

    const extrinsic = singletonApi.tx.statefulStorage.applyItemActionsWithSignature(delegatorKey, proof, payload.toU8a())

    const signingKey = getSelectedOption('signing-address').value;
    const signingAccount = validAccounts[signingKey];

    providerName === 'localhost' ?
        await submitExtrinsicWithKeyring(extrinsic, signingAccount as KeyringPair, () => setProgress(submitButtonId, false)):
        await submitExtrinsicWithExtension(extrinsic, signingAccount, signingKey, () => setProgress(submitButtonId, false));
    setProgress(submitButtonId, false)
}

async function signUpsertPageWithSignature(event: Event) {
    event.preventDefault();
    if (!validateForm(formSelectors.upsertPageForm)) { return; }
    clearFormInvalid(formSelectors.upsertPageForm);

    const {delegatorKey, payload} = await getUpsertPageFormData(singletonApi);
    const delegatorAccount = validAccounts[delegatorKey];

    const signature = providerName == 'localhost' ?
        signPayloadWithKeyring(delegatorAccount, payload) :
        await signPayloadWithExtension(delegatorAccount, delegatorKey, payload)

    let signatureEl = document.getElementById('signed_payload') as HTMLTextAreaElement;
    signatureEl.value = signature;
}
async function submitUpsertPageWithSignature(event: Event) {
    event.preventDefault();
    if (!validateForm(formSelectors.upsertPageForm)) { return; }
    clearFormInvalid(formSelectors.upsertPageForm);

    let submitButtonId = (event.target as HTMLElement).id
    setProgress(submitButtonId, true);

    const { signingKey, delegatorKey, payload, signatures} = await getUpsertPageFormData(singletonApi);
    const proof = { Sr25519: signatures[0] };

    const extrinsic = singletonApi.tx.statefulStorage.upsertPageWithSignature(delegatorKey, proof, payload.toU8a());
    const signingAccount = validAccounts[signingKey];

    providerName === 'localhost' ?
        await submitExtrinsicWithKeyring(extrinsic, signingAccount as KeyringPair, () => setProgress(submitButtonId, false)):
        await submitExtrinsicWithExtension(extrinsic, signingAccount, signingKey, () => setProgress(submitButtonId, false));
    setProgress(submitButtonId, false)
}

async function signDeletePageWithSignature(event: Event){
    event.preventDefault();
    const formId = formSelectors.deletePageForm;
    if (!validateForm(formId)) { return; }
    clearFormInvalid(formId);

    const { delegatorKey, payload } =
        await getDeletePageWithSignatureFormData(singletonApi);
    const delegatorAccount = validAccounts[delegatorKey];

    const signature = providerName == 'localhost' ?
        signPayloadWithKeyring(delegatorAccount, payload) :
        await signPayloadWithExtension(delegatorAccount, delegatorKey, payload)

    let signatureEl = document.getElementById(domActionsSelectors.signedPayload1Id) as HTMLTextAreaElement;
    signatureEl.value = signature;
}
async function submitDeletePageWithSignature(event: Event){
    event.preventDefault();
    if (!validateForm(formSelectors.deletePageForm)) { return; }
    clearFormInvalid(formSelectors.deletePageForm);

    let submitButtonId = (event.target as HTMLElement).id
    setProgress(submitButtonId, true);

    const { signingKey, delegatorKey, payload, signatures} = await getDeletePageWithSignatureFormData(singletonApi);
    const proof = { Sr25519: signatures[0] };
    const extrinsic = singletonApi.tx.statefulStorage.deletePageWithSignature(delegatorKey, proof, payload.toU8a())
    const signingAccount = validAccounts[signingKey];

    providerName === 'localhost' ?
        await submitExtrinsicWithKeyring(extrinsic, signingAccount as KeyringPair, () => setProgress(submitButtonId, false)):
        await submitExtrinsicWithExtension(extrinsic, signingAccount, signingKey, () => setProgress(submitButtonId, false));
    setProgress(submitButtonId, false)
}


function init() {
    callAndRegisterProviderChangeEvent();
    (document.getElementById(domActionsSelectors.connectButton) as HTMLElement).addEventListener("click", connect);
}

init();

