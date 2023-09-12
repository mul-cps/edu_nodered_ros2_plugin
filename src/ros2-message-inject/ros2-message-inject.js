// RED argument provides the module access to Node-RED runtime api
module.exports = function(RED)
{
    var execFile = require('child_process').execFile;
    var cron = require('cron');
    var fs = require('fs');
    var ros2_home = '/opt/ros/' + process.env.ROS_DISTRO;
    if (process.env.IS_ROS2_PATH) {
        ros2_home = process.env.IS_ROS2_PATH;
    }

    /*
     * @function ROS2InjectNode constructor
     * This node is defined by the constructor function ROS2InjectNode,
     * which is called when a new instance of the node is created
     *
     * @param {Object} n - Contains the properties set in the flow editor
     */
    function ROS2InjectNode(n) {
        RED.nodes.createNode(this, n);

        this.props = n.props;
        this.repeat = n.repeat;
        this.crontab = n.crontab;
        this.once = n.once;
        this.onceDelay = (n.onceDelay || 0.1) * 1000;
        this.interval_id = null;
        this.cronjob = null;
        var node = this;

        node.status({fill: null, shape: null, text: ""});

        if (node.repeat > 2147483) {
            node.error(RED._("inject.errors.toolong", this));
            delete node.repeat;
        }

        node.repeaterSetup = function () {
            if (this.repeat && !isNaN(this.repeat) && this.repeat > 0) {
                this.repeat = this.repeat * 1000;
                if (RED.settings.verbose) {
                    this.log(RED._("inject.repeat", this));
                }
                this.interval_id = setInterval(function() {
                    node.emit("input", {});
                }, this.repeat);
            } else if (this.crontab) {
                if (RED.settings.verbose) {
                    this.log(RED._("inject.crontab", this));
                }
                this.cronjob = new cron.CronJob(this.crontab, function() { node.emit("input", {}); }, null, true);
            }
        };

        if (this.once) {
            this.onceTimeout = setTimeout( function() {
                node.emit("input",{});
                node.repeaterSetup();
            }, this.onceDelay);
        } else {
            node.repeaterSetup();
        }

        // Receiving of Input Data
        this.on("input", function(msg, send, done) {
            var errors = [];

            this.props.forEach(p => {
                var property = p.p;
                var value = p.v ? p.v : '';
                var valueType = p.vt ? p.vt : 'str';

                if (!property) return;

                try {
                    RED.util.setMessageProperty(msg,property,RED.util.evaluateNodeProperty(value, valueType, this, msg),true);
                } catch (err) {
                    errors.push(err.toString());
                }
            });

            if (errors.length) {
                done(errors.join('; '));
            } else {
                send(msg);
                done();
            }
        });
    }

    // The node is registered in the runtime using the name ROS2 Inject
    RED.nodes.registerType("ROS2 Inject", ROS2InjectNode);

    ROS2InjectNode.prototype.close = function() {
        if (this.onceTimeout) {
            clearTimeout(this.onceTimeout);
        }
        if (this.interval_id != null) {
            clearInterval(this.interval_id);
            if (RED.settings.verbose) { this.log(RED._("ROS2 Inject.stopped")); }
        } else if (this.cronjob != null) {
            this.cronjob.stop();
            if (RED.settings.verbose) { this.log(RED._("ROS2 Inject.stopped")); }
            delete this.cronjob;
        }
    };

    function updateNodeProps(node, props) {
        node.props = JSON.parse(props);
    }


    RED.httpAdmin.post("/inject/:id/:props", RED.auth.needsPermission("ROS2 Inject.write"), function(req,res) {
        var node = RED.nodes.getNode(req.params.id);
        if (node != null) {
            try {
                updateNodeProps(node, req.params.props);
                node.receive();
                res.sendStatus(200);
            } catch(err) {
                res.sendStatus(500);
                node.error(RED._("ROS2 Inject.failed",{error:err.toString()}));
            }
        } else {
            res.sendStatus(404);
        }
    });

    /**
     * @brief Function that returns all the occurences of the substring in the main string
     * @param {String} substring - Contains the characters that want to be located
     * @param {String} string - Contains the main string
     * @returns
     */
    function locations (substring, string) {
        var a = [],i = -1;
        while ((i = string.indexOf(substring, i+1)) >= 0)
        {
            a.push(i);
        }
        return a;
    };

    /**
     * @brief Function to sort the type structures according to its dependencies
     * @param {Array} result - Array for storing the sort result
     * @param {Array} visited - Array containing the objects already visited
     * @param {Map} map - Map containing all the objects that need to be sorted
     * @param {Object} obj  - Current object
     */
    function sort_util(result, visited, map, obj){
        visited[obj[0]] = true;
        Object.entries(obj[1]).forEach(function(dep){
            if(!visited[dep[1]] && Object.keys(map).includes(dep[1])) {
                sort_util(result, visited, map, map[dep[1]]);
            }
        });
        result.push(obj);
    }

    function remove_constants_from_idl(idl) {
        message_string = [];
        drop_line = false;
        idl.split('\n').forEach(line => {
            if (drop_line == false && line.includes("_Constants {")) {
                drop_line = true;
            }
            else if (drop_line == true && line.includes("};")) {
                drop_line = false;
            }
            else if (drop_line == false) {
                message_string.push(line);
            }
        });

        console.log("message string");
        console.log(message_string.join('\n'));
        return message_string.join('\n');
    }

    function pick_message_type_from_service_request(idl) {
        message_string = [];
        drop_line = false;
        idl.split('\n').forEach(line => {
            if (drop_line == false && line.includes("_Response {")) {
                drop_line = true;
            }
            else if (drop_line == true && line.includes("};")) {
                drop_line = false;
            }
            else if (drop_line == false) {
                message_string.push(line);
            }
        });

        console.log("message string");
        console.log(message_string.join('\n'));
        return message_string.join('\n');        
    }

    function get_line_indent(line) {
        for (let i = 0; i < line.length; ++i) {
            if (line.charAt(i) != '\t') {
                return i;
            }
        }
    }

    function get_index_of_last_colon(line) {
        for (let i = line.length - 1; i >= 0; --i) {
            if (line.charAt(i) == '.') {
                return i;
            }
        }

        throw new Error("String doesn't contain a colon.");
    }

    function get_index_of_nth_colon(line, nth) {
        num_found_colon = 0;
        for (let i = 0; i < line.length; ++i) {
            if (line.charAt(i) == '.') {
                ++num_found_colon;
                if (num_found_colon >= nth) {
                    return i;
                }
            }
        }

        throw new Error("String doesn't contain enough colons.");
    }

    function get_type_and_name(line) {
        line_parts = line.split(' ');
        if (line_parts.length < 2) {
            // unexpected format --> ignore
            console.log("line '" + line + "' should be a type definition");
            return;
        }

        return { type: line_parts[0], name: line_parts[1] };
    }

    RED.httpAdmin.get("/getinterface", RED.auth.needsPermission("ROS2 Inject.write"), function(req,res)
    {
        console.log("Try to get interface:");
        var interface_name = "";
        var type_list = [];

        if (req.query['msg']) {
            interface_name = req.query['package'] + "/msg/" + req.query['msg'];
        }
        else if (req.query['srv']) {
            interface_name = req.query['package'] + "/srv/" + req.query['srv'];
        }
        else {
            console.log("Missing 'msg' or 'srv' in getinterface request.");
            return;
        }
        console.log("interface name = " + interface_name);
        execFile("ros2", ["interface", "show", interface_name], function(error, stdout, stderr) {
            // handle special case ROS service
            if (req.query['srv']) {
                // get request type only
                stdout = stdout.split('---')[0];
                console.log("picked request part only:");
                console.log(stdout);
            }

            type_indent = 0;
            type_name = "";
            type = "";

            stdout.split('\n').forEach(line => {
                if (line.indexOf('#') >= 0) {
                    // remove comment from line
                    line = line.substring(0, line.indexOf('#'));
                }
                if (line.length == 0 || line.charAt(0) == ' ' || line.charAt(0) == '\n') {
                    // empty line --> ignore
                    return;
                }
                if (line.includes('=')) {
                    // constant value --> ignore
                    return;
                }
                // clean up line
                let current_line_indent = get_line_indent(line);
                line = line.substring(current_line_indent);
                console.log('cleaned up line: ' + line);
                console.log('type_indent = ' + type_indent);
                console.log('current_line_indent = ' + current_line_indent);

                if (current_line_indent > type_indent) {
                    // found new subtype --> add to name
                    type_indent = current_line_indent;
                    type_entry = get_type_and_name(line);
                    type_name += '.' + type_entry['name'];
                    type = type_entry['type'];
                }
                else if (current_line_indent == type_indent) {
                    // found new type
                    // --> store previous one in list
                    type_list.push({ 'type': type, 'name': type_name });
                    // --> get current one
                    type_indent = current_line_indent;
                    type_entry = get_type_and_name(line);
                    type = type_entry['type'];       

                    if (current_line_indent == 0) {
                        type_name = type_entry['name'];
                    }
                    else {
                        type_name = type_name.substring(0, get_index_of_last_colon(type_name)) + '.' + type_entry['name'];
                    }
                }
                else if (current_line_indent == 0) {
                    // top level
                    // --> store previous one in list
                    type_list.push({ 'type': type, 'name': type_name });
                    // --> get current one
                    type_indent = current_line_indent;
                    type_entry = get_type_and_name(line);
                    type_name = type_entry['name'];
                    type = type_entry['type'];                         
                }
                else {
                    // end of subtype
                    // --> store previous one in list
                    type_list.push({ 'type': type, 'name': type_name });
                    // --> get current one
                    type_indent = current_line_indent;
                    type_entry = get_type_and_name(line);
                    type_name = type_name.substring(0, get_index_of_nth_colon(type_name, current_line_indent)) + '.' + type_entry['name'];
                    type = type_entry['type'];                                                            
                }

                console.log("type_name = " + type_name);
                console.log("type = " + type);
            });

            type_list.push({ 'type': type, 'name': type_name });
            console.log("found type list:");
            type_list.shift();
            console.log(type_list);
            res.json(type_list);
            console.log("res:\n" + res);

            console.log("DEBUG OUTPUT");
            console.log(stdout);
            console.log(stderr);
            console.log(error);
        });
    })

    // Function that returns the IDL associated with the selected message type
    RED.httpAdmin.get("/getidl", RED.auth.needsPermission("ROS2 Inject.write"), function(req,res)
    {
        console.log("Building Message Type String");
        var idl = "";
        var message_string = "";

        if (req.query['idl']) {
            idl = req.query['idl'];
        }
        else if (req.query['msg']) {
            var msg_path = ros2_home + "/share/" + req.query['package'] + "/msg/" + req.query['msg'] + ".idl";
            idl = fs.readFileSync(msg_path).toString();
            message_string = remove_constants_from_idl(idl);
        }
        else if (req.query['srv']) {
            var msg_path = ros2_home + "/share/" + req.query['package'] + "/srv/" + req.query['srv'] + ".idl";
            idl = fs.readFileSync(msg_path).toString();
            message_string = pick_message_type_from_service_request(idl);
            // message_string = idl;     
        }

        var type_dict = {};
        // console.log("idl string:");
        // console.log(idl);

        // Executes the xtypes command line validator to get the type members
        execFile("xtypes_idl_validator", [String(message_string)], function(error, stdout, stderr) {
            // Defined Structure Position
            // console.log(stdout);
            // console.log(stderr);
            // console.log(error);
            stdout = stdout.substr(stdout.indexOf('Struct Name:'));
            var occurences = locations('Struct Name:', stdout);

            var i = 0;
            occurences.forEach( s_pos =>
            {
                var members = locations('Struct Member:', stdout);
                var struct_name = stdout.substr(s_pos + 12/*Struct Name:*/, members[i] - (s_pos + 12 + 1) /*\n*/);
                type_dict[struct_name] = {};

                members.forEach( pos => {
                    var init_pos = stdout.indexOf('[', pos);
                    var inner_name = stdout.substr(pos + 14/*Struct Member:*/, init_pos - (pos + 14));
                    if (inner_name == struct_name)
                    {
                        var member = stdout.substr(init_pos + 1, stdout.indexOf(']', pos) - init_pos - 1);
                        var data = member.split(',');
                        type_dict[inner_name][data[0]] = data[1];
                        i++;
                    }
                });
            });

            var map = {}; // Creates key value pair of name and object
            var result = []; // the result array
            var visited = {}; // takes a note of the traversed dependency

            Object.entries(type_dict).forEach( function(obj){ // build the map
                map[obj[0]]  = obj;
            });

            Object.entries(type_dict).forEach(function(obj){ // Traverse array
                if(!visited[obj[0]]) { // check for visited object
                    sort_util(result, visited, map, obj);
                }
            });

            console.log(result);
            res.json(result);
        });
    });
}
