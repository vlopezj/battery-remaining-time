/*
 * Copyright © 2012 Davide Alberelli <dadexix86@gmail.com>
 * Based on the works by Faidon Liambotis <paravoid@debian.org>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.

 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.

 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 *
 * Alternatively, you can redistribute and/or modify this program under the
 * same terms that the “gnome-shell” or “gnome-shell-extensions” software
 * packages are being distributed by The GNOME Project.
 *
 */

const St = imports.gi.St;
const Lang = imports.lang;
const Status = imports.ui.status;
const Panel = imports.ui.panel;
const Main = imports.ui.main;

let showArrowOnCharge = false;
let showOnCharge = true;

function init(meta) {
    // empty
}

function monkeypatch(batteryArea) {
    // add a method to the original power indicator that replaces the single
    // icon with the combo icon/label(s); this is dynamically called the first time
    // a battery is found in the _updateLabel() method
    batteryArea._replaceIconWithBox = function replaceIconWithBox() {
        if (this._withLabel)
            return;
        this._withLabel = true;

        let icon = this.actor.get_children()[0];

        // remove the initial actor of the single icon
        this.actor.remove_actor(icon);

        // create a new box layout, composed of a) a "bin", b) the label
        let box = new St.BoxLayout({ name: 'batteryBox' });
        this.actor.add_actor(box);

        let iconBox = new St.Bin();
        box.add(iconBox, { y_align: St.Align.MIDDLE, y_fill: false });

        this._label = new St.Label();
        box.add(this._label, { y_align: St.Align.MIDDLE, y_fill: false });

        // finally, put the original icon into the bin
        iconBox.child = icon;
    };

    // do the exact opposite: replace the box with the original icon and
    // destroy the bin/box. i.e. revert the original behavior, useful
    // when disabling the extension :-)
    batteryArea._replaceBoxWithIcon = function replaceBoxWithIcon() {
        if (!this._withLabel)
            return;
        this._withLabel = false;

        let box = this.actor.get_children()[0];
        let bin = box.get_children()[0];
        let label = box.get_children()[1];
        let icon = bin.child;

        this.actor.remove_actor(box);
        icon.reparent(this.actor);

        label.destroy();
        bin.destroy();
        box.destroy();
    }

    // now, we must ensure that our time label is updated
    // hence, create a function that enumerates the devices and, if a battery
    // is found, updates the label with the time remaining
    // (code heavily borrowed from ui.status.power)
    batteryArea._updateLabel = function updateLabel() {
        this._proxy.GetDevicesRemote(Lang.bind(this, function(devices, error) {
            if (error) {
                if (this._withLabel) {
                    this._label.set_text("");
                }
                return;
            }

            // for some peculiar reason, there isn't always a primary device,
            // even on simple laptop configurations with a single battery.
            // Hence, instead of using GetPrimaryDevice, we enumerate all
            // devices, and then either pick the primary if found or fallback
            // on the first battery found
            let firstMatch, bestMatch, charging;
            for (let i = 0; i < devices.length; i++) {
                let [device_id, device_type, icon, percentage, state, seconds] = devices[i];
                if (device_type != Status.power.UPDeviceType.BATTERY)
                    continue;

                charging = state;

                if (device_id == this._primaryDeviceId) {
                    bestMatch = seconds;
                    // the primary is preferred, no reason to keep searching
                    break;
                }

                if (!firstMatch){
                    firstMatch = seconds;
                }
            }

            // if there was no primary device, just pick the first
            if (!bestMatch)
                bestMatch = firstMatch;

            if (bestMatch) {
                let displayString;
                if (bestMatch > 60){
                    let time = Math.round(bestMatch / 60);
                    let minutes = time % 60;
                    let hours = Math.floor(time / 60);
                    this.timeString = C_("battery time remaining","%d:%02d").format(hours,minutes);
                } else {
                    this.timeString = '-- ';
                }
                
                if (charging == '1'){
                    if (showArrowOnCharge)
                        displayString = decodeURIComponent(escape('↑ ')).toString() + this.timeString;
                    else
                        displaystring = ' '.toString() + this.timeString;
                            
                    if(!showOnCharge)
                        hideBattery();
                    else
                        showBattery();
                } else {
                    displayString = ' '.toString() + this.timeString;
                }

                if (!this._withLabel) {
                    this._replaceIconWithBox();
                }
                
                this._label.set_text(displayString);
                
            } else {
                // no battery found... hot-unplugged?
                this._label.set_text("");
            }
        }));
    };
}

function hideBattery() {
    for (var i = 0; i < Main.panel._rightBox.get_children().length; i++) {
            if (Main.panel._statusArea['battery'] == 
            Main.panel._rightBox.get_children()[i]._delegate ||
            Main.panel._statusArea['batteryBox'] == 
            Main.panel._rightBox.get_children()[i]._delegate) {
            global.log("Battery Remaing Time: hiding battery.");
            Main.panel._rightBox.get_children()[i].hide();
            break;
        }
    }
}

function showBattery() {
    for (var i = 0; i < Main.panel._rightBox.get_children().length; i++) {
            if (Main.panel._statusArea['battery'] == 
            Main.panel._rightBox.get_children()[i]._delegate ||
            Main.panel._statusArea['batteryBox'] == 
            Main.panel._rightBox.get_children()[i]._delegate) {
//            global.log("SHOW:" + 'battery');
            Main.panel._rightBox.get_children()[i].show();
            break;
        }
    }
}

function enable() {
    // monkey-patch the existing battery icon, called "batteryArea" henceforth
    let batteryArea = Main.panel._statusArea['battery'];
    if (!batteryArea)
        return;

    monkeypatch(batteryArea);

    // hook our extension to the signal and do the initial update
    batteryArea._labelSignalId = batteryArea._proxy.connect('Changed', Lang.bind(batteryArea, batteryArea._updateLabel));
    batteryArea._updateLabel();
}

function disable() {
    let batteryArea = Main.panel._statusArea['battery'];
    if (!batteryArea)
        return;

    try {
        if (batteryArea._labelSignalId) {
            batteryArea._proxy.disconnect(batteryArea._labelSignalId);
        }
        batteryArea._replaceBoxWithIcon();
    } finally {
        delete batteryArea._replaceIconWithBox;
        delete batteryArea._replaceBoxWithIcon;
        delete batteryArea._updateLabel;
        delete batteryArea._labelSignalId;
        delete batteryArea._label;
        delete batteryArea._withLabel;
    }
}

