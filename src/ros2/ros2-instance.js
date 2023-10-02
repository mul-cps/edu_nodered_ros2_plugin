const rclnodejs = require("rclnodejs");

class Ros2Instance {
  static #_instance = undefined;
  
  constructor() {
    // initialize ros and create a ros node
    this.#init();
    // spinning node in async function
    this.#spin();
  }

  // Creates and spins node in separate thread.
  #init() {
    rclnodejs.init();
    this.ros_node = rclnodejs.createNode("node_red");
  }

  async #spin() {
    // spinning node until application is closed
    rclnodejs.spin(this.ros_node);
  }

  static instance()
  {
    if (Ros2Instance.#_instance == undefined) {
      Ros2Instance.#_instance = new Ros2Instance();
    }

    return Ros2Instance.#_instance;
  }

  get node() {
    return this.ros_node;
  }
}

module.exports = { Ros2Instance }
