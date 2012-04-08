/*
 * Gnome Shell Extension: battery-remaining-time
 *
 * Copyright © 2012 Davide Alberelli <dadexix86@gmail.com>
 * 
 * Some code is borrowed from http://blog.mecheye.net/
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
 * Important note: there are is a big difference in how metadata are managed
 * from 3.2 to 3.4 version of the shell.
 * Please have a look at 
 *      http://blog.mecheye.net/2012/02/more-extension-api-breaks/
 * for more informations.
 *
 *
 *    The different lines are marked with a comment saying that's for 3.4.
 *
 */

const St = imports.gi.St;
const Lang = imports.lang;
const Status = imports.ui.status;
const Panel = imports.ui.panel;
const Main = imports.ui.main;

//const Gio = imports.gi.Gio;     // 3.4
//let Me = imports.misc.extensionUtils.getCurrentExtension(); // 3.4
//let Convenience = Me.imports.convenience; // 3.4

//Gio.app_info_launch_default_for_uri(Me.dir.get_uri(), global.create_app_launch_context()); // 3.4

//let metadata = Me.metadata; // 3.4
//Gio.app_info_launch_default_for_uri(metadata.url, global.create_app_launch_context()); // 3.4

/*
let settings = Convenience.getSettings(Me);

let showIcon = settings.get_boolean('show-icon');                       //show the icon
let showArrowOnCharge = settings.get_boolean('show-arrow-on-charge');   //show an arrow up when charging
let showPercentage = settings.get_boolean('show-percentage');           //show percentage near time
let showOnCharge = settings.get_boolean('show-on-charge');              //show the battery when charging
let showOnFull = settings.get_boolean('show-on-full');                  //show the battery when full charged
*/

let showIcon = true;
let showArrowOnCharge = true;
let showPercentage = true;
let showOnCharge = true;
let showOnFull = true;


function init() {
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

        // create the bin and eventually put the original icon into it
        if (showIcon) {
            let iconBox = new St.Bin();
            box.add(iconBox, { y_align: St.Align.MIDDLE, y_fill: false });
            iconBox.child = icon;
        }

        this._label = new St.Label();
        box.add(this._label, { y_align: St.Align.MIDDLE, y_fill: false });

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
            let results, firstMatch, bestMatch, charging, percent, arrow, perc;
            
            [results]=devices;
            
            for (let i = 0; i < results.length; i++) {
                let [device_id, device_type, icon, percent, charging, seconds] = results[i];
                if (device_type != Status.power.UPDeviceType.BATTERY)
                    continue;

                if (device_id == this._primaryDeviceId) {
                    bestMatch = [seconds,Math.floor(percent),charging];
                    // the primary is preferred, no reason to keep searching
                    break;
                }

                if (!firstMatch)
                    firstMatch = [seconds,Math.floor(percent),charging];
            }

            // if there was no primary device, just pick the first
            if (!bestMatch)
                bestMatch = firstMatch;
            
            //global.log("bestMatch:" + bestMatch.toString());
            
            this.displayString = ' ';
            
            if (bestMatch[0] > 60){
                let time = Math.round(bestMatch[0] / 60);
                let minutes = time % 60;
                let hours = Math.floor(time / 60);
                this.timeString = C_("battery time remaining","%d:%02d").format(hours,minutes);
            } else {
                this.timeString = '-- ';
            }
             
            let arrow;

            if (showArrowOnCharge)
                arrow = decodeURIComponent(escape('↑ ')).toString();
            else
                arrow = ' ';

            if (bestMatch[2] == 1){
                if(!showOnCharge)
                    hideBattery();
                else{
                    if (showPercentage)
                        this.displayString = arrow + bestMatch[1].toString() + '% (' + this.timeString + ')';
                    else
                        this.displayString = arrow + this.timeString;
                    showBattery();
                }
            } else {
                if (bestMatch[2] == 4){
                    if (!showOnFull)
                        hideBattery();
                    else {
                        this.timeString = decodeURIComponent(escape('∞'));

                        if (showPercentage)
                            this.displayString = '100% (' + this.timeString + ')';
                        else
                            this.displayString = ' ' + this.timeString;
                        showBattery();
                    }
                } else {
                    if (showPercentage)
                        this.displayString = ' ' + bestMatch[1].toString() + '% (' + this.timeString + ')';
                    else
                        this.displayString = ' ' + this.timeString;
                }
            }

            //global.log("displayString:" + this.displayString.toString());

            if (!this._withLabel) {
                this._replaceIconWithBox();
            }
            
            this._label.set_text(this.displayString);
        }));
    };
}

function hideBattery() {
    for (var i = 0; i < Main.panel._rightBox.get_children().length; i++) {
        if (Main.panel._statusArea['battery'] == 
            Main.panel._rightBox.get_children()[i]._delegate ||
            Main.panel._statusArea['batteryBox'] == 
            Main.panel._rightBox.get_children()[i]._delegate) {
            //global.log("Battery Remaing Time: hiding battery.");
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
            //global.log("Battery Remaing Time: hiding battery.");
            Main.panel._rightBox.get_children()[i].show();
            break;
        }
    }
}

function enable() {
    // monkey-patch the existing battery icon, called "batteryArea" henceforth
    let batteryArea = Main.panel._statusArea['battery'];
    if (!batteryArea){
        //global.log("No battery Area!");
        return;
    }

    monkeypatch(batteryArea);

    // hook our extension to the signal and do the initial update
    batteryArea._labelSignalId = batteryArea._proxy.connect('g-properties-changed', Lang.bind(batteryArea, batteryArea._updateLabel));
    batteryArea._updateLabel();
}

function disable() {
    let batteryArea = Main.panel._statusArea['battery'];
    if (!batteryArea){
        return;
    }

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

