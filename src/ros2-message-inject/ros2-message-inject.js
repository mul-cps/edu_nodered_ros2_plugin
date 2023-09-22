// RED argument provides the module access to Node-RED runtime api
module.exports = function(RED)
{
    var execFile = require('child_process').execFile;
    var cron = require('cron');
    var interface_list = [];

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
                send({ payload: msg });
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
        line_parts = line.split(/\s+/);
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
        else if (req.query['action']) {
            interface_name = req.query['package'] + "/action/" + req.query['action'];
        }
        else {
            console.log("Missing 'msg', 'srv' or 'action' in getinterface request.");
            return;
        }
        console.log("interface name = " + interface_name);

        // If already estimated use existing entry.
        if (interface_list[interface_name] != undefined) {
            console.log("uses already estimated type list:");
            console.log(interface_list[interface_name]);
            res.json(interface_list[interface_name]);
            return;
        }

        // No interface entry found --> estimate it...
        execFile("ros2", ["interface", "show", interface_name], function(error, stdout, stderr) {
            // handle special case ROS service
            if (req.query['srv'] != undefined) {
                // get request type only
                stdout = stdout.split('---')[0];
                console.log("picked request part only:");
                console.log(stdout);
            }
            // handle special case ROS actions
            else if (req.query['action'] != undefined) {
                // get goal request type only
                stdout = stdout.split('---')[0];
                console.log("picked goal request part only:");
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
            interface_list[interface_name] = type_list;
            res.json(type_list);
        });
    })
}
