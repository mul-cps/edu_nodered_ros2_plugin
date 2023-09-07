const rclnodejs = require("rclnodejs");

class Ros2Instance {
  constructor() {
    this.init();
  }

  // Creates and spins node in separate thread.
  async init() {
    await rclnodejs.init();
    this.ros_node = rclnodejs.createNode("node_red");
    // spinning node
    rclnodejs.spin(this.ros_node);
  }

  get node() {
    return this.ros_node;
  }
}

module.exports = new Ros2Instance();