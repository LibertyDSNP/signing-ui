import {domActionsSelectors, showExtrinsicStatus, onProviderEndpointChanged, clearFormInvalid, validateForm} from "../src/domActions";

import {expect, test} from "@jest/globals";
import '@testing-library/jest-dom';

let alert;
beforeAll(() => {
    alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
})
test("showExtrinsicStatus works", () => {
    const status = "Succeeded";
    document.body.innerHTML =
        `<div id=${domActionsSelectors.extrinsicStatus}></div>`;

    showExtrinsicStatus(status);
    let newEl = document.getElementById(domActionsSelectors.extrinsicStatus)
        .childNodes.item(0) as HTMLElement;
    expect(newEl.innerText).toBe(status);
});

test("onProviderEndpointChanged", () => {
    document.body.innerHTML =
        `<select id=${domActionsSelectors.providerList} required>
            <option value="wss://rpc.rococo.frequency.xyz" name="rococo">Rococo</option>
            <option value="ws://localhost:9944" name="localhost">Localhost</option>
            <option id=${domActionsSelectors.otherEndpointSelection}>Other endpoint</option>
        </select>
    
        <fieldset id=${domActionsSelectors.otherEndpointFieldset}>
            <label for="other-endpoint-url">WSS Endpoint</label>
            <input id="other-endpoint-url" placeholder="wss://some.frequency.node"/>
        </fieldset>`

    let providerSelect = document.getElementById(domActionsSelectors.providerList) as HTMLSelectElement;
    providerSelect.namedItem('rococo').selected = true;
    onProviderEndpointChanged(null);
    let otherEl = document.getElementById(domActionsSelectors.otherEndpointFieldset);
    expect(otherEl).toHaveClass('hidden')
    providerSelect.namedItem('rococo').selected = false;
    providerSelect.namedItem(domActionsSelectors.otherEndpointSelection).selected = true;
    onProviderEndpointChanged(null);
    expect(otherEl).not.toHaveClass('hidden')
});

test("clearFormInvalid removes only the 'hidden' class", () => {
    document.body.innerHTML = `
        <form id="test">    
        <input id="test1" type="text" class="${domActionsSelectors.requiredFormMissing} one input">        
        <input id="test2" type="text" class="${domActionsSelectors.requiredFormMissing} input">        
        <input id="test3" type="text" class="${domActionsSelectors.requiredFormMissing} input">        
        </form>
`
    clearFormInvalid("test");
    expect(document.getElementsByClassName(domActionsSelectors.requiredFormMissing).length).toBe(0);
    expect(document.getElementsByClassName('one').length).toBe(1);
    expect(document.getElementsByClassName('input').length).toBe(3);
});

test("validateForm works", () => {
    document.body.innerHTML = `
    <form id="test">
        <input id="test1" type="text" class="one input" required>        
        <input id="test2" type="text" class="input">        
        <input id="test3" type="text" class="input" required>                
    </form>
    `
    validateForm("test");
    expect(document.getElementsByClassName(domActionsSelectors.requiredFormMissing).length).toBe(2);
    expect(alert).toHaveBeenCalledTimes(1);

    (document.getElementById('test1') as HTMLInputElement).value = "some text";
    (document.getElementById("test2") as HTMLInputElement).value = "some more text";
    validateForm("test");
    expect(document.getElementsByClassName(domActionsSelectors.requiredFormMissing).length).toBe(1);
    expect(alert).toHaveBeenCalledTimes(2);
});

test("listenForExtrinsicsChange does", () => {

})