// RED argument provides the module access to Node-RED runtime api
module.exports = function(RED)
{
    var fs = require('fs');
    var path = require('path');
    var ros2_home = '/opt/ros/' + process.env.ROS_DISTRO;
    if (process.env.IS_ROS2_PATH) {
        ros2_home = process.env.IS_ROS2_PATH;
    }

    /*
     * @function ROS2ServiceTypes constructor
     * This node is defined by the constructor function ROS2ServiceTypes,
     * which is called when a new instance of the node is created
     *
     * @param {Object} config - Contains the properties set in the flow editor
     */
    function ROS2ServiceTypes(config)
    {
        // Initiliaze the features shared by all nodes
        RED.nodes.createNode(this, config);
        var node = this;

        // Event emitted when the deploy is finished
        RED.events.once("flows:started", function() {
            node.status({ fill: "green", shape: "dot", text: ""});
        });

	    // Registers a listener to the input event,
        // which will be called whenever a message arrives at this node
        node.on('input', function(msg) {
            // Passes the message to the next node in the flow
            node.send(msg);
        });

        // Called when there is a re-deploy or the program is closed
        node.on('close', function() {
            node.status({ fill: null, shape: null, text: ""});            
        });
    }

    // The node is registered in the runtime using the name publisher
    RED.nodes.registerType("ROS2 Service Type", ROS2ServiceTypes);

    // Function that pass the IS ROS 2 compiled packages to the html file
    RED.httpAdmin.get("/ros2packages", RED.auth.needsPermission('ROS2 Service Type.read'), function(req,res)
    {
        var files = fs.readdirSync(ros2_home + "/share/");

        // Check if it is a srv package
        files.forEach( function(value)
        {
            if (!fs.existsSync(ros2_home + "/share/" + value + "/srv"))
            {
                files = files.filter(f => f != value);
            }
        });

        res.json(files);
    });

    // Function that pass the IS ROS 2 package compiled msgs to the html file
    RED.httpAdmin.get("/ros2srvs", RED.auth.needsPermission('ROS2 Service Type.read'), function(req,res)
    {
        var msgs_path = ros2_home + "/share/" + req.query["package"] + "/srv/";

        var files = fs.readdirSync(msgs_path);

        // Check that it is a file with .idl
        files.forEach( function(filename)
        {
            if (path.extname(filename) != ".idl")
            {
                files = files.filter(f => f != filename);
            }
        });

        files.forEach( function(filename, index)
        {
            files[index] = path.parse(filename).name;
        })

        res.json(files);
    });

    // Function that pass the selected message idl and srv codes
    RED.httpAdmin.get("/msgidl", RED.auth.needsPermission('ROS2 Service Type.read'), function(req,res)
    {
        if (req.query['srv'])
        {
            var json_data = {}
            // IDL
            var msg_path = ros2_home + "/share/" + req.query['package'] + "/srv/" + req.query['srv'];

            var idl = fs.readFileSync(msg_path + ".idl").toString();
            json_data["idl"] = idl;

            // MSG
            if (fs.existsSync(msg_path + ".srv"))
            {
                var srv = fs.readFileSync(msg_path + ".srv").toString();
                json_data["srv"] = srv;
            }
            else
            {
                json_data["srv"] = "";
            }
            res.json(json_data);
        }
    });
}
