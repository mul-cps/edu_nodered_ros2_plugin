ARG ROS_DISTRO=humble

# FROM eprosima/vulcanexus:$ROS_DISTRO
# FROM eduartrobotik/eduart-ros-base:humble-1.2.0
FROM eduartrobotik/eduart-robot:0.3.1

# Avoid interactuation with installation of some package that needs the locale.
USER root
ENV TZ=Europe/Berlin
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Avoids using interactions during building
ENV DEBIAN_FRONTEND=noninteractive

# Use a bash shell so it is possigle to run things like `source` (required for colcon builds)
SHELL ["/bin/bash", "-c"]

# Installing Node Red with ROS2 node.js integration
# RUN echo "Installing Node Red with ROS2 Plugin" \
#     cd /home/$USER \
#     && wget https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh \
#     && chmod u+x install.sh \
#     && ./install.sh \
#     && export NVM_DIR="$HOME/.nvm" \
#     && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" \
#     && nvm install 18 node \
#     && source /opt/ros/$ROS_DISTRO/setup.bash \
#     && source /home/user/ros/install/setup.bash \
#     && npm install -g --unsafe-perm \
#         node-red \
#         rclnodejs \
#         cron

# Install Integration Service dependencies
RUN apt-get update \
    && apt-get remove -y \
        nodejs \
        libnode-dev \
        libnode72 \
    && apt-get install -y \
        cmake \
        curl \
        g++ \
        gcc \
        make \
        git \
        libasio-dev \
        libboost-dev \
        libboost-program-options-dev \
        libboost-system-dev \
        libcurl4-openssl-dev \
        libcurlpp-dev \
        libssl-dev \
        libwebsocketpp-dev \
        libyaml-cpp-dev \
        python3-pip \
        wget && \
    pip3 install -U \
        colcon-common-extensions \
        vcstool \
    && curl -sL https://deb.nodesource.com/setup_18.x -o nodesource_setup.bash && \
    chmod +x nodesource_setup.bash && \
    bash -c ./nodesource_setup.bash && \
    apt-get install -y nodejs

# Install Integration Service used for ROS Type Determining
RUN echo "building and installing integration service" \
    && mkdir -p /is_ws/src && cd "$_" \
    && git clone https://github.com/eProsima/Integration-Service.git is \
    && . /opt/ros/$ROS_DISTRO/setup.sh \
    && source /home/user/ros/install/setup.bash \
    && colcon build --cmake-args -DIS_ROS2_SH_MODE=DYNAMIC --install-base /opt/is

# Install Node-RED and node-red-ros2-plugin
RUN source /opt/ros/$ROS_DISTRO/setup.bash \
    && source /home/user/ros/install/setup.bash \
    # && export NVM_DIR="$HOME/.nvm" \
    # && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" \
    && npm install -g --unsafe-perm \
        node-red \
        rclnodejs \
        cron

# Coping and Installing ROS2 Plugin
COPY ./edu_nodered_ros2_plugin /home/user/edu_nodered_ros2_plugin
RUN echo "installing ROS2 plugin" \
    && cd /home/user/ \
    # && export NVM_DIR="$HOME/.nvm" \
    # && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" \
    && npm install -g ./edu_nodered_ros2_plugin

# Enable overlay execution
WORKDIR /
COPY ./entrypoint.bash .
RUN chmod +x /entrypoint.bash

# CMD [ "node", "/usr/bin/node-red" ]
CMD /usr/bin/node-red
ENTRYPOINT [ "/entrypoint.bash" ]
