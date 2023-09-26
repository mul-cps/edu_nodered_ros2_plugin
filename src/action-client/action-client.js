let { Ros2Instance } = require('../ros2/ros2-instance');
const { rclnodejs, ActionClient } = require("rclnodejs");

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
    function ActionClientNode(config)
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
            console.log("creating action client...");
            console.log("type:")
            console.log(config['selectedtype']);

            this.action_client = new ActionClient(Ros2Instance.instance().node, config['selectedtype'], config['topic']);

            node.ready = true;
            node.status({ fill: "yellow", shape: "dot", text: "created"});
            console.log("action client was created successfully");
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
                node.status({ fill: "green", shape: "dot", text: "waiting to request action"});
            }
        });

        // Registers a listener to the input event,
        // which will be called whenever a message arrives at this node
        node.on('input', function(msg) {
            if (node.ready) {
                if (this.action_client.isActionServerAvailable() == false) {
                    node.status({ fill: "yellow", shape: "dot", text: "action not available"});
                    return;
                }

                console.log("starting of performing action");
                node.future_action_result = performing_action(node, msg.payload);
                console.log("started async function");
            }
            else {
               done("node was not ready to process flow data");
            }
        });

        // Called when there is a re-deploy or the program is closed
        node.on('close', function() {
            this.action_client.destroy();
            this.action_client = null;
            node.status({ fill: null, shape: null, text: ""});
        });
    }

    // performing action
    async function performing_action(node, goal_request)
    {
        console.log("try to send goal_request:");
        console.log(goal_request);
        try {
            // service is available and ready
            const goal_handle_promise = node.action_client.sendGoal(goal_request, function(feedback) {
                // Passes the message to the next node in the flow
                node.status({ fill: "green", shape: "dot", text: "action is processing"});
                node.send({ }, { payload: feedback });
            });
        
            node.status({ fill: "green", shape: "dot", text: "goal request published"});
            const goal_handle = await goal_handle_promise;

            if (goal_handle.isAccepted() == false) {
                node.status({ fill: "red", shape: "dot", text: "gaol request rejected"});
                return;
            }

            console.log("action goal was accepted");
            const result = await goal_handle.getResult();
            console.log("received action result");

            if (goal_handle.isSucceeded() == false) {
                node.status({ fill: "red", shape: "dot", text: "gaol failed"});
                return;
            }

            node.status({ fill: "green", shape: "dot", text: "result received"});
            node.send({ payload: result }, { });
        }
        catch (error) {
            console.log("sending goal request failed. error:");
            console.log(error);
            node.status({ fill: "red", shape: "dot", text: "sending gaol request failed"});
        }     
    }

    // The node is registered in the runtime using the name "Action Client"
    RED.nodes.registerType("Action Client", ActionClientNode);

    //Function that sends to the html file the qos descriptions read from the json file
    RED.httpAdmin.get("/subqosdescription", RED.auth.needsPermission('Action Client.read'), function(req,res)
    {
        var description_path = __dirname + "/../qos-description.json";
        var rawdata  = fs.readFileSync(description_path);
        let json = JSON.parse(rawdata);
        res.json(json);
    });
}
