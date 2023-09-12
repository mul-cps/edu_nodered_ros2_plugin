const ros_node = require('../ros2/ros2-instance');
const rclnodejs = require("rclnodejs");

// RED argument provides the module access to Node-RED runtime api
module.exports = function(RED)
{
    var fs = require('fs');
    /*
     * @function SubscriberNode constructor
     * This node is defined by the constructor function SubscriberNode,
     * which is called when a new instance of the node is created
     *
     * @param {Object} config - Contains the properties set in the flow editor
     */
    function ServiceClientNode(config)
    {
        // Initialize the features shared by all nodes
        RED.nodes.createNode(this, config);
        this.props = config.props;
        var node = this;
        node.ready = false;

        // \todo handle domain id differently
        if(config.domain) {
            // modify the global domain
            node.domain = RED.nodes.getNode(config.domain).domain;
        }

        try {
            console.log("creating service client...");
            console.log("type:")
            console.log(config['selectedtype']);

            this.client = ros_node.node.createClient(config['selectedtype'], config['topic'])
            node.ready = true;
            node.status({ fill: "yellow", shape: "dot", text: "created"});
            console.log("service client was created successfully");
        }
        catch (error) {
            console.log("creating subscription failed");
            console.log(error);
            node.ready = false;
            node.status({ fill: "red", shape: "dot", text: "error"});
        }

        // Event emitted when the deploy is finished
        RED.events.once('flows:started', function() {
            if (node.ready) {
                node.status({ fill: "green", shape: "dot", text: "waiting to request service"});
            }
        });

        // Registers a listener to the input event,
        // which will be called whenever a message arrives at this node
        node.on('input', function(msg) {
            if (node.ready) {
                if (this.client.isServiceServerAvailable() == false) {
                    node.status({ fill: "yellow", shape: "dot", text: "service not available"});
                    return;
                }

                // service is available and ready
                node.status({ fill: "green", shape: "dot", text: "request published"});

                this.client.sendRequest(msg, function(response) {
                    // Passes the message to the next node in the flow
                    node.status({ fill: "green", shape: "dot", text: "response received"});
                    node.send(response);
                });
            }
            else {
               done("node was not ready to process flow data");
            }
        });

        // Called when there is a re-deploy or the program is closed
        node.on('close', function() {
            ros_node.node.destroyClient(this.client);
            this.client = null;
            node.status({ fill: null, shape: null, text: ""});
        });
    }

    // The node is registered in the runtime using the name "Service Client"
    RED.nodes.registerType("Service Client", ServiceClientNode);

    //Function that sends to the html file the qos descriptions read from the json file
    RED.httpAdmin.get("/subqosdescription", RED.auth.needsPermission('Service Client.read'), function(req,res)
    {
        var description_path = __dirname + "/../qos-description.json";
        var rawdata  = fs.readFileSync(description_path);
        let json = JSON.parse(rawdata);
        res.json(json);
    });
}
