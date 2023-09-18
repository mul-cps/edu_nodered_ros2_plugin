const rclnodejs = require("rclnodejs");

function get_qos_from_props (config)
{
    var qos = { "qos": {}};
    config.forEach( function(q) {
        var pos = q.p.indexOf('.');
        if (pos != -1) {
            var qos_type = q.p.substr(0, pos);
            var param = q.p.substr(pos + 1);

            if (!Object.keys(qos["qos"]).includes(qos_type)) {
                qos["qos"][qos_type] = {};
            }

            pos = param.indexOf('.');

            if (pos != -1) {
                param = param.substr(pos + 1);
            }

            qos["qos"][qos_type][param] = q.v;
        }
        else
        {
            qos["qos"][q.p] = q.v;
        }
    });

    qos_mapped = new rclnodejs.QoS();
    if (qos['qos']['history'] != undefined && qos['qos']['history']['kind'] != undefined) {
        qos_mapped.history = rclnodejs.QoS.HistoryPolicy['RMW_QOS_POLICY_HISTORY_' + qos['qos']['history']['kind']];
    }
    if (qos['qos']['reliability'] != undefined) {
        qos_mapped.reliability = rclnodejs.QoS.ReliabilityPolicy['RMW_QOS_POLICY_RELIABILITY_' + qos['qos']['reliability']];
    }
    if (qos['qos']['durability'] != undefined) {
        qos_mapped.durability = rclnodejs.QoS.DurabilityPolicy['RMW_QOS_POLICY_DURABILITY_' +  qos['qos']['durability']];
    }
    if (qos['qos']['history'] != undefined && qos['qos']['history']['depth'] != undefined) {
        qos_mapped.depth = Number(qos['qos']['history']['depth']);
    }
    else {
        qos_mapped.depth = 2;
    }

    return qos_mapped;
};


// RED argument provides the module access to Node-RED runtime api
module.exports = function(RED)
{
    var fs = require('fs');
    // var is_web_api = require('is-web-api').ros2;
    var ros_node = require('../ros2/ros2-instance');  
    /*
     * @function PublisherNode constructor
     * This node is defined by the constructor function PublisherNode,
     * which is called when a new instance of the node is created
     *
     * @param {Object} config - Contains the properties set in the flow editor
     */
    function PublisherNode(config)
    {
        // Initialize the features shared by all nodes
        RED.nodes.createNode(this, config);
        this.props = config.props;
        var node = this;
        node.ready = false;

        // \todo handle domain id differently
        if(config.domain) {
            // modify the global domain
            var selected_domain = RED.nodes.getNode(config.domain).domain;
        }

        // Creating Publisher
        try {
            console.log("creating publisher...");
            console.log("type:")
            console.log(config['selectedtype']);

            qos = get_qos_from_props(config['props']);
            console.log("uses following QoS:")
            console.log(qos);

            this.publisher = ros_node.node.createPublisher(config['selectedtype'], config['topic'], {qos});
            node.ready = true;
            node.status({ fill: "yellow", shape: "dot", text: "created"});
            console.log("publisher was created successfully");            
        }
        catch (error) {
            console.log("creating publisher failed");
            console.log(error);
            node.ready = false;
            node.status({ fill: "red", shape: "dot", text: "error"});
        }

        // Event emitted when the deploy is finished
        RED.events.once('flows:started', function() {
            node.status({ fill: "green", shape: "dot", text: "waiting to publish message"});
        });

        // Registers a listener to the input event,
        // which will be called whenever a message arrives at this node
        node.on('input', function(msg) {
            if (node.ready) {
                node.status({ fill: "green", shape: "dot", text: "message published"});

                // Passes the message to the next node in the flow
                node.send(msg);
                this.publisher.publish(msg.payload);
            }
            else {
               done("node was not ready to process flow data");
            }
        });

        // Called when there is a re-deploy or the program is closed
        node.on('close', function() {
            ros_node.node.destroyPublisher(this.publisher);
            this.publish = null;
            node.status({ fill: null, shape: null, text: ""});
        });
    }

    // The node is registered in the runtime using the name Publisher
    RED.nodes.registerType("Publisher", PublisherNode);

    // Function that sends to the html file the qos descriptions read from the json file
    RED.httpAdmin.get("/pubqosdescription", RED.auth.needsPermission('Publisher.read'), function(req,res)
    {
        var description_path = __dirname + "/../qos-description.json";
        var rawdata  = fs.readFileSync(description_path);
        let json = JSON.parse(rawdata);
        res.json(json);
    });
}
