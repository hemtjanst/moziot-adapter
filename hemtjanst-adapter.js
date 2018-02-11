const Adapter = require('../adapter');
const MozDevice = require('../device');
const Property = require('../property');
const ht = require('hemtjanst');

const Server = ht.server;
const HtDevice = ht.device;

const mqtt = require('mqtt');
const things = require('../addon-constants');

function loadHemtjanstAdapter(addonManager, manifest, errorCallback) {
    return new HemtjanstAdapter(addonManager, manifest);
}

function topic2id(topic) {
    return "HT-" + topic.replace(/\//g, '-');
}

class HemtjanstFeature extends Property {

    constructor(device, name, propertyDescr) {
        super(device, name, propertyDescr);
        console.log(["New Feature", name, propertyDescr]);
        this.onSetCb = [];
    }

    onUpdate(d,f,v) {
        this.setCachedValue(v);
        console.log(["New Value from MQTT", this.name, v]);
        this.device.notifyPropertyChanged(this);
    }

    on(ev, cb) {
        this.onSetCb.push(cb);
    }

    async setValue(value) {
        console.log(["New Value from MozIot", this.name, value]);
        this.onSetCb.forEach(v=>{
            v(value)
        });
        return value;
    }

}

class HemtjanstDevice extends MozDevice {

    constructor(adapter, device) {
        super(adapter, topic2id(device.topicName()));
        this.device = device;
        this.type = this.deviceType();
        this.name = device.getName();
        let features = this.device.getFeatures();
        for (let k in features) {
            if (!features.hasOwnProperty(k)) continue;
            this.initFeature(k);
        }
    }

    initFeature(feature) {
        let name = undefined;
        let type = undefined;
        let unit = undefined;
        let updateTransform = v=>v;
        let setTransform = v=>v.toString();

        switch(feature) {
            case "contactSensorState":
            case "on":
                name = "on";
                type = "boolean";
                updateTransform = v => v==='true'||v==='1';
                setTransform = v => !!v?'1':'0';
                break;
            case "brightness":
                name = "level";
                type = "number";
                unit = "percent";
                updateTransform = v => parseInt(v);
                setTransform = v => ""+v;
                break;
            case "color":
                name = "color";
                type = "string";
                break;
            case "currentPower":
                name = "instantaneousPower";
                type = "number";
                unit = "watt";
                updateTransform = v => parseFloat(v);
                setTransform = v => ""+v;
                break;
            case "currentVoltage":
                name = "voltage";
                type = "number";
                unit = "volt";
                updateTransform = v => parseFloat(v);
                setTransform = v => ""+v;
                break;
            case "currentAmpere":
                name = "current";
                type = "number";
                unit = "ampere";
                updateTransform = v => parseFloat(v);
                setTransform = v => ""+v;
                break;
        }


        if (name === undefined) {
            return;
        }

        let ft = new HemtjanstFeature(this, name, {
            type: type,
            unit: unit,
        });


        this.device.onUpdate(feature, (a,b,c) => ft.onUpdate(a,b,updateTransform(c)));
        ft.on("set", v => {
            this.device.set(feature, setTransform(v));
        });
        this.properties.set(name, ft);
    }

    deviceType() {
        let ft = this.device.getFeatures();
        switch(this.device.getType()) {
            case "outlet":
                if (ft.hasOwnProperty("currentPower")) {
                    return things.THING_TYPE_SMART_PLUG;
                }
                return things.THING_TYPE_ON_OFF_SWITCH;
            case "switch":
                return things.THING_TYPE_ON_OFF_SWITCH;
            case "contactSensor":
                return things.THING_TYPE_BINARY_SENSOR;
            case "lightbulb":
                let capColor = false;
                let capDim = false;
                let capTemp = false;
                for (let k in ft) {
                    if (!ft.hasOwnProperty(k)) continue;
                    switch(k) {
                        case "colorTemperature":
                            capTemp = true;
                            break;
                        case "brightness":
                            capDim = true;
                            break;
                        case "color":
                            capColor = true;
                            break;
                    }
                }

                if (capDim && capColor) {
                    return things.THING_TYPE_DIMMABLE_COLOR_LIGHT;
                }
                if (capColor) {
                    return things.THING_TYPE_ON_OFF_COLOR_LIGHT;
                }
                if (capDim) {
                    return things.THING_TYPE_DIMMABLE_LIGHT;
                }
                return things.THING_TYPE_ON_OFF_LIGHT;


            default:
                return "thing";
        }
    }

}


class HemtjanstAdapter extends Adapter {

    constructor(addonManager, manifest) {
        super(addonManager, 'HemtjänstPlugin', manifest.name);

        this.ready = false;
        this.config = manifest.moziot.config || {};
        this.mqtt = mqtt.connect(this.config.mqtt||"tcp://localhost:1883", this.config.mqttOpts||{});
        this.hemtjanst = new Server(this.mqtt);
        addonManager.addAdapter(this);
        let timer = undefined;
        this.hemtjanst.on("device", (dev) => {
            try {
                let newDev = new HemtjanstDevice(this, dev);
                this.handleDeviceAdded(newDev);
                if (typeof timer === "undefined") {
                    timer = setTimeout(v => {
                        console.log('Adapter:', this.name, 'id', this.id, 'setting ready=true');
                        this.ready = true;
                    }, 1000);
                }
            } catch (err) {
                console.error(err);
            }
        })
    }

}


module.exports = {
    loadHemtjanstAdapter: loadHemtjanstAdapter
};
