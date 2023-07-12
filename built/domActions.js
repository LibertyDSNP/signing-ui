// For functions that act only on the DOM and don't need any external imports
let registeredEvents = {};
export const domActionsSelectors = {
    connectButton: "connect-button",
    spinner: "txProcessing",
    spinnerContainer: "txProcessingContainer",
    connectionStatus: "connection-status",
    isProcessing: "isProcessing",
    requiredFormMissing: "invalid",
    hiddenClass: "hidden",
    extrinsicsListId: "extrinsics",
    signedPayload1Id: "signed_payload",
    signedPayload2Id: "signed_payload2",
    extrinsicStatus: "extrinsic-status",
    otherEndpointSelection: "other-endpoint-value",
    otherEndpointFieldset: "other-endpoint",
    otherEndpointURL: "other-endpoint-url",
    providerList: "provider-list",
};
// Simple loading and button blocker
export function setProgress(id, isInProgress) {
    const spinner = document.getElementById("txProcessing");
    const submitButton = document.getElementById(id);
    const spinnerContainer = document.getElementById('txProcessingContainer');
    if (isInProgress) {
        document.getElementById(domActionsSelectors.extrinsicStatus).innerText = "";
        submitButton.disabled = true;
        spinner.style.display = "block";
        spinnerContainer.setAttribute("class", "isProcessing");
    }
    else {
        submitButton.disabled = false;
        spinner.style.display = "none";
        spinnerContainer.setAttribute("class", "");
    }
}
export function setConnectionProgress(id, isInProgress) {
    const submitButton = document.getElementById(id);
    submitButton.disabled = isInProgress;
}
export function setVisibility(id, isVisible) {
    let el = document.getElementById(id);
    if (el) {
        if (isVisible) {
            el.classList.remove(domActionsSelectors.hiddenClass);
        }
        else {
            !el.classList.contains(domActionsSelectors.hiddenClass) && el.classList.add('hidden');
        }
    }
}
export function showExtrinsicForm(event) {
    event.preventDefault();
    clearSignedPayloads();
    if (event.target && event.target.selectedOptions?.length) {
        const selectEl = event.target;
        const formToShow = selectEl.selectedOptions[0].value || "";
        const forms = document.getElementsByClassName("extrinsic-form");
        for (let i = 0; i < forms.length; i++) {
            // @ts-ignore
            let form_id = forms.item(i).id;
            setVisibility(form_id, form_id === formToShow);
        }
    }
    else {
        console.error("Could not find selected option");
    }
}
export function listenForExtrinsicsChange() {
    // If people are playing around and switching providers, don't keep registering the listener.
    if (!`registeredEvents`["extrinsics"]) {
        let extrinsicsEl = document.getElementById(domActionsSelectors.extrinsicsListId);
        extrinsicsEl.addEventListener("change", showExtrinsicForm);
        let signedPayloadEl = document.getElementById(domActionsSelectors.signedPayload1Id);
        signedPayloadEl.value = '';
        registeredEvents["extrinsics"] = true;
    }
    return;
}
// assumes only 1 item is selected.
export function getSelectedOption(elementId) {
    return document.getElementById(elementId).selectedOptions[0];
}
// Gets the raw value from HTMLInputElement
export function getHTMLInputValue(elementId) {
    return document.getElementById(elementId).value;
}
export function clearSignedPayloads() {
    document.getElementById(domActionsSelectors.signedPayload1Id).value = '';
    document.getElementById(domActionsSelectors.signedPayload2Id).value = '';
}
export function validateForm(formId) {
    let form = document.getElementById(formId);
    let inputs = form.getElementsByTagName('input');
    let formValid = true;
    for (let i = 0; i < inputs.length; i++) {
        let input = inputs[i];
        if (input.required && input.value === '') {
            input.classList.add(domActionsSelectors.requiredFormMissing);
            formValid = false;
        }
        else {
            input.classList.remove(domActionsSelectors.requiredFormMissing);
        }
    }
    if (!formValid) {
        alert("Please fill out all form items");
    }
    return formValid;
}
export function clearFormInvalid(formId) {
    let form = document.getElementById(formId);
    let inputs = form.getElementsByTagName('input');
    for (let i = 0; i < inputs.length; i++) {
        inputs.item(i)?.classList.remove(domActionsSelectors.requiredFormMissing);
    }
}
export function showExtrinsicStatus(status) {
    let newEl = document.createElement("p");
    newEl.innerText = status;
    document.getElementById(domActionsSelectors.extrinsicStatus).appendChild(newEl);
}
export function onProviderEndpointChanged(_event) {
    let selectEl = document.getElementById(domActionsSelectors.providerList);
    let otherIsSelected = selectEl.selectedOptions.namedItem(domActionsSelectors.otherEndpointSelection);
    setVisibility(domActionsSelectors.otherEndpointFieldset, !!otherIsSelected);
}
export function callAndRegisterProviderChangeEvent() {
    onProviderEndpointChanged(null);
    document.getElementById(domActionsSelectors.providerList).addEventListener("change", onProviderEndpointChanged);
}
