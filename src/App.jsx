import React, { useState, useEffect, useRef, useCallback } from 'react';
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

// Zustand Store for global state management
const useStore = create((set, get) => ({
  clusters: [], // Array of cluster objects
  nodes: {}, // Map of node objects, keyed by node_id
  gatewayConnections: [], // Array of gateway connection objects
  messages: [], // Array of active message objects for animation
  logs: [], // Array of log entries
  simulationSpeed: 500, // Milliseconds per simulation tick
  isSimulationRunning: false,

  // Actions
  addLog: (entry) => set((state) => ({ logs: [...state.logs, `${new Date().toLocaleTimeString()} - ${entry}`] })),
  
  addCluster: (name) => {
    const newCluster = {
      uuid: uuidv4(),
      name: name,
      position: {
        x: Math.random() * 600 + 50, // Random position for visualization
        y: Math.random() * 300 + 50,
      },
      size: { width: 300, height: 200 }, // Default size
    };
    set((state) => ({ clusters: [...state.clusters, newCluster] }));
    get().addLog(`集群 '${name}' (UUID: ${newCluster.uuid.substring(0, 8)}...) 已创建.`);
    return newCluster;
  },

  removeCluster: (clusterUuid) => {
    set((state) => {
      const newClusters = state.clusters.filter((c) => c.uuid !== clusterUuid);
      const newNodes = { ...state.nodes };
      Object.values(newNodes).forEach(node => {
        if (node.cluster_uuid === clusterUuid) {
          delete newNodes[node.id];
        }
      });
      const newGatewayConnections = state.gatewayConnections.filter(
        (conn) =>
          newNodes[conn.gateway1_id] && newNodes[conn.gateway2_id] &&
          newNodes[conn.gateway1_id].cluster_uuid !== clusterUuid &&
          newNodes[conn.gateway2_id].cluster_uuid !== clusterUuid
      );
      get().addLog(`集群 (UUID: ${clusterUuid.substring(0, 8)}...) 已移除.`);
      return { clusters: newClusters, nodes: newNodes, gatewayConnections: newGatewayConnections };
    });
  },

  addNode: (clusterUuid, nodeName, isGateway) => {
    const cluster = get().clusters.find((c) => c.uuid === clusterUuid);
    if (!cluster) {
      get().addLog(`错误: 无法在不存在的集群 ${clusterUuid.substring(0, 8)}... 中添加节点.`);
      return;
    }
    const newNodeId = uuidv4();
    const newNode = {
      id: newNodeId,
      node_name: nodeName,
      cluster_uuid: clusterUuid,
      is_gateway: isGateway,
      local_gateways: {}, // For standard nodes
      inter_cluster_routing_table: isGateway ? { [clusterUuid]: { destination_cluster_uuid: clusterUuid, next_hop_node_name: nodeName, next_hop_cluster_uuid: clusterUuid, cost: 0 } } : {}, // For gateway nodes
      position: {
        x: cluster.position.x + Math.random() * (cluster.size.width - 60) + 30, // Position within cluster
        y: cluster.position.y + Math.random() * (cluster.size.height - 60) + 30,
      },
    };
    set((state) => ({
      nodes: { ...state.nodes, [newNodeId]: newNode },
    }));
    get().addLog(`节点 '${nodeName}' (ID: ${newNodeId.substring(0, 8)}..., ${isGateway ? '网关' : '普通'}) 已添加到集群 ${cluster.name}.`);
    return newNode;
  },

  removeNode: (nodeId) => {
    set((state) => {
      const newNodes = { ...state.nodes };
      const nodeToRemove = newNodes[nodeId];
      if (!nodeToRemove) return state;
      delete newNodes[nodeId];
      const newGatewayConnections = state.gatewayConnections.filter(
        (conn) => conn.gateway1_id !== nodeId && conn.gateway2_id !== nodeId
      );
      get().addLog(`节点 '${nodeToRemove.node_name}' (ID: ${nodeId.substring(0, 8)}...) 已移除.`);
      return { nodes: newNodes, gatewayConnections: newGatewayConnections };
    });
  },

  connectGateways: (gateway1Id, gateway2Id) => {
    const { nodes, gatewayConnections, addLog } = get();
    const gw1 = nodes[gateway1Id];
    const gw2 = nodes[gateway2Id];

    if (!gw1 || !gw2 || !gw1.is_gateway || !gw2.is_gateway) {
      addLog('错误: 只能连接两个网关节点.');
      return;
    }
    if (gw1.cluster_uuid === gw2.cluster_uuid) {
      addLog('错误: 不能连接同一集群内的网关.');
      return;
    }
    if (gatewayConnections.some(c => (c.gateway1_id === gateway1Id && c.gateway2_id === gateway2Id) || (c.gateway1_id === gateway2Id && c.gateway2_id === gateway1Id))) {
      addLog('错误: 这些网关已经连接.');
      return;
    }

    const newConnection = { id: uuidv4(), gateway1_id: gateway1Id, gateway2_id: gateway2Id };
    set((state) => ({ gatewayConnections: [...state.gatewayConnections, newConnection] }));
    addLog(`网关 '${gw1.node_name}' 和 '${gw2.node_name}' 已连接.`);
  },

  disconnectGateways: (connectionId) => {
    set((state) => {
      const connectionToRemove = state.gatewayConnections.find(c => c.id === connectionId);
      if (!connectionToRemove) return state;
      const gw1 = state.nodes[connectionToRemove.gateway1_id];
      const gw2 = state.nodes[connectionToRemove.gateway2_id];
      get().addLog(`网关 '${gw1.node_name}' 和 '${gw2.node_name}' 已断开.`);
      return { gatewayConnections: state.gatewayConnections.filter((c) => c.id !== connectionId) };
    });
  },

  sendMessage: (sourceClusterUuid, sourceNodeName, destClusterUuid, destNodeName, payload) => {
    const { nodes, clusters, addLog } = get();
    const sourceNode = Object.values(nodes).find(
      (n) => n.cluster_uuid === sourceClusterUuid && n.node_name === sourceNodeName
    );
    const destNode = Object.values(nodes).find(
      (n) => n.cluster_uuid === destClusterUuid && n.node_name === destNodeName
    );

    if (!sourceNode) {
      addLog(`错误: 源节点 '${sourceNodeName}' 在集群 ${sourceClusterUuid.substring(0, 8)}... 不存在.`);
      return;
    }
    if (!destNode) {
      addLog(`错误: 目的节点 '${destNodeName}' 在集群 ${destClusterUuid.substring(0, 8)}... 不存在.`);
      return;
    }

    const newMessage = {
      id: uuidv4(),
      source_cluster_uuid: sourceClusterUuid,
      source_node_name: sourceNodeName,
      destination_cluster_uuid: destClusterUuid,
      destination_node_name: destNodeName,
      payload: payload,
      ttl: 10, // Initial TTL
      trace_route: [],
      current_node_id: sourceNode.id,
      path_nodes: [], // This will be determined dynamically
      current_path_index: 0,
      status: 'moving',
      position: { ...sourceNode.position }, // Start at source node's position
    };
    set((state) => ({ messages: [...state.messages, newMessage] }));
    addLog(`消息从 '${sourceNode.node_name}@${clusters.find(c => c.uuid === sourceNode.cluster_uuid)?.name}' 发送至 '${destNode.node_name}@${clusters.find(c => c.uuid === destNode.cluster_uuid)?.name}'.`);
  },

  updateNode: (nodeId, updates) => {
    set((state) => ({
      nodes: {
        ...state.nodes,
        [nodeId]: { ...state.nodes[nodeId], ...updates },
      },
    }));
  },

  updateMessage: (messageId, updates) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      ),
    }));
  },

  removeMessage: (messageId) => {
    set((state) => ({
      messages: state.messages.filter((msg) => msg.id !== messageId),
    }));
  },

  toggleSimulation: () => set((state) => ({ isSimulationRunning: !state.isSimulationRunning })),
  setSimulationSpeed: (speed) => set({ simulationSpeed: speed }),
}));

// Helper to get node position (for drawing lines)
const getNodePosition = (node, nodes) => {
  const n = nodes[node.id];
  if (!n) return { x: 0, y: 0 };
  return { x: n.position.x + 15, y: n.position.y + 15 }; // Center of node (30x30)
};

// Main App Component
const App = () => {
  const {
    clusters,
    nodes,
    gatewayConnections,
    messages,
    logs,
    simulationSpeed,
    isSimulationRunning,
    addCluster,
    removeCluster,
    addNode,
    removeNode,
    connectGateways,
    disconnectGateways,
    sendMessage,
    updateNode,
    updateMessage,
    removeMessage,
    addLog,
    toggleSimulation,
    setSimulationSpeed,
  } = useStore(); 

  const [newClusterName, setNewClusterName] = useState('');
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeCluster, setNewNodeCluster] = useState('');
  const [newNodeIsGateway, setNewNodeIsGateway] = useState(false);
  const [connectGw1, setConnectGw1] = useState('');
  const [connectGw2, setConnectGw2] = useState('');
  const [sendSourceCluster, setSendSourceCluster] = useState('');
  const [sendSourceNode, setSendSourceNode] = useState('');
  const [sendDestCluster, setSendDestCluster] = useState('');
  const [sendDestNode, setSendDestNode] = useState('');
  const [sendPayload, setSendPayload] = useState('');

  // State for selected node to display routing table
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const selectedNode = selectedNodeId ? nodes[selectedNodeId] : null;

  const svgRef = useRef(null);

  // Drag functionality for clusters and nodes
  const [draggingItem, setDraggingItem] = useState(null); // { type: 'cluster' | 'node', id: string, startX, startY, offsetX, offsetY }

  const handleMouseDown = useCallback((e, type, id) => {
    // Prevent click event from firing immediately after drag start
    e.stopPropagation(); 
    const item = type === 'cluster' ? clusters.find(c => c.uuid === id) : nodes[id];
    if (!item) return;

    setDraggingItem({
      type,
      id,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - item.position.x,
      offsetY: e.clientY - item.position.y,
    });
  }, [clusters, nodes]);

  const handleMouseMove = useCallback((e) => {
    if (!draggingItem) return;

    const newX = e.clientX - draggingItem.offsetX;
    const newY = e.clientY - draggingItem.offsetY;

    // Access `set` from the useStore hook directly
    useStore.setState(state => { // Use useStore.setState for direct state updates outside the store definition
      if (draggingItem.type === 'cluster') {
        const updatedClusters = state.clusters.map(c =>
          c.uuid === draggingItem.id ? { ...c, position: { x: newX, y: newY } } : c
        );
        // Update positions of nodes within the dragged cluster
        const cluster = updatedClusters.find(c => c.uuid === draggingItem.id);
        const updatedNodes = { ...state.nodes };
        Object.values(updatedNodes).forEach(node => {
          if (node.cluster_uuid === draggingItem.id) {
            // Calculate new relative position
            const oldCluster = state.clusters.find(c => c.uuid === draggingItem.id);
            const relativeX = node.position.x - oldCluster.position.x;
            const relativeY = node.position.y - oldCluster.position.y;
            updatedNodes[node.id] = {
              ...node,
              position: { x: newX + relativeX, y: newY + relativeY }
            };
          }
        });
        return { clusters: updatedClusters, nodes: updatedNodes };
      } else { // type === 'node'
        const updatedNodes = {
          ...state.nodes,
          [draggingItem.id]: {
            ...state.nodes[draggingItem.id],
            position: { x: newX, y: newY },
          },
        };
        return { nodes: updatedNodes };
      }
    });
  }, [draggingItem]); 

  const handleMouseUp = useCallback(() => {
    setDraggingItem(null);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);


  // Simulation Loop
  useEffect(() => {
    if (!isSimulationRunning) return;

    const interval = setInterval(() => {
      // IGDP: Gateway Announcements
      Object.values(nodes).forEach((node) => {
        if (node.is_gateway) {
          // Simulate broadcasting to all standard nodes in its cluster
          Object.values(nodes).forEach((otherNode) => {
            if (!otherNode.is_gateway && otherNode.cluster_uuid === node.cluster_uuid) {
              // Standard node receives announcement
              updateNode(otherNode.id, {
                local_gateways: {
                  ...otherNode.local_gateways,
                  [node.node_name]: Date.now(),
                },
              });
              addLog(`IGDP: 网关 '${node.node_name}' 宣告给普通节点 '${otherNode.node_name}'.`); // Keep this commented unless needed for verbose debugging
            }
          });
        }
      });

      // IGDP: Standard Node Cleanup
      Object.values(nodes).forEach((node) => {
        if (!node.is_gateway) {
          const updatedGateways = { ...node.local_gateways };
          for (const gwName in updatedGateways) {
            if (Date.now() - updatedGateways[gwName] > simulationSpeed * 3) { // 3 times announcement interval
              delete updatedGateways[gwName];
              addLog(`IGDP: 普通节点 '${node.node_name}' 移除离线网关 '${gwName}'.`);
            }
          }
          if (JSON.stringify(updatedGateways) !== JSON.stringify(node.local_gateways)) {
            updateNode(node.id, { local_gateways: updatedGateways });
          }
        }
      });

      // ICRP: Gateway Routing Table Exchange
      gatewayConnections.forEach((conn) => {
        const gw1 = nodes[conn.gateway1_id];
        const gw2 = nodes[conn.gateway2_id];

        if (!gw1 || !gw2) return; // Connection might be to a removed node

        // Simulate exchange: gw1 sends to gw2, gw2 sends to gw1
        const exchangeTables = (sender, receiver) => {
          let updated = false;
          const newRoutingTable = { ...receiver.inter_cluster_routing_table };
          const senderClusterName = clusters.find(c => c.uuid === sender.cluster_uuid)?.name || sender.cluster_uuid.substring(0, 4);
          const receiverClusterName = clusters.find(c => c.uuid === receiver.cluster_uuid)?.name || receiver.cluster_uuid.substring(0, 4);

          for (const destClusterUuid in sender.inter_cluster_routing_table) {
            const senderEntry = sender.inter_cluster_routing_table[destClusterUuid];
            const newCost = senderEntry.cost + 1; // Cost to reach via sender
            const destClusterName = clusters.find(c => c.uuid === destClusterUuid)?.name || destClusterUuid.substring(0, 4);

            if (destClusterUuid === receiver.cluster_uuid) continue; // Don't route to self

            if (
              !newRoutingTable[destClusterUuid] ||
              newCost < newRoutingTable[destClusterUuid].cost
            ) {
              newRoutingTable[destClusterUuid] = {
                destination_cluster_uuid: destClusterUuid,
                next_hop_node_name: sender.node_name,
                next_hop_cluster_uuid: sender.cluster_uuid,
                cost: newCost,
              };
              updated = true;
              addLog(`ICRP: 网关 '${receiver.node_name}@${receiverClusterName}' 通过 '${sender.node_name}@${senderClusterName}' 发现新路由到集群 '${destClusterName}' (成本: ${newCost}).`);
            } else if (
              newRoutingTable[destClusterUuid] &&
              newRoutingTable[destClusterUuid].next_hop_node_name === sender.node_name &&
              newCost > newRoutingTable[destClusterUuid].cost // If sender's cost increased, update
            ) {
                 newRoutingTable[destClusterUuid] = {
                    destination_cluster_uuid: destClusterUuid,
                    next_hop_node_name: sender.node_name,
                    next_hop_cluster_uuid: sender.cluster_uuid,
                    cost: newCost,
                };
                updated = true;
                addLog(`ICRP: 网关 '${receiver.node_name}@${receiverClusterName}' 更新路由到集群 '${destClusterName}' (通过 '${sender.node_name}@${senderClusterName}', 新成本: ${newCost}).`);
            }
          }
          // Handle routes that are no longer reachable via this connection
          for (const destClusterUuid in newRoutingTable) {
            if (newRoutingTable[destClusterUuid].next_hop_node_name === sender.node_name &&
                !sender.inter_cluster_routing_table[destClusterUuid]) {
                  // This route was via sender, but sender no longer has it. Mark as unreachable or remove.
                  const destClusterName = clusters.find(c => c.uuid === destClusterUuid)?.name || destClusterUuid.substring(0, 4);
                  delete newRoutingTable[destClusterUuid];
                  updated = true;
                  addLog(`ICRP: 网关 '${receiver.node_name}@${receiverClusterName}' 移除通过 '${sender.node_name}@${senderClusterName}' 到集群 '${destClusterName}' 的路由 (不再可达).`);
            }
          }

          if (updated) {
            updateNode(receiver.id, { inter_cluster_routing_table: newRoutingTable });
            // The more specific logs above already cover the updates.
          }
        };

        exchangeTables(gw1, gw2);
        exchangeTables(gw2, gw1);
      });

      // Message Routing
      messages.forEach((message) => {
        if (message.status !== 'moving') return;

        const currentNode = nodes[message.current_node_id];
        if (!currentNode) {
          addLog(`消息 (ID: ${message.id.substring(0, 4)}...) 丢失，当前节点不存在.`);
          removeMessage(message.id);
          return;
        }

        if (message.ttl <= 0) {
          addLog(`消息 (ID: ${message.id.substring(0, 4)}...) TTL 已耗尽，已丢弃.`);
          removeMessage(message.id);
          return;
        }

        const nextTraceRoute = [...message.trace_route, currentNode.node_name];
        let nextNodeId = null;

        if (message.destination_cluster_uuid === currentNode.cluster_uuid) {
          // Target in local cluster
          const destNode = Object.values(nodes).find(
            (n) =>
              n.cluster_uuid === message.destination_cluster_uuid &&
              n.node_name === message.destination_node_name
          );
          if (destNode) {
            nextNodeId = destNode.id;
            if (currentNode.id === destNode.id) {
              addLog(`消息 (ID: ${message.id.substring(0, 4)}...) 已送达 '${destNode.node_name}@${clusters.find(c => c.uuid === destNode.cluster_uuid)?.name}'.`);
              updateMessage(message.id, { status: 'delivered', trace_route: nextTraceRoute });
              // Remove message after a short delay for visual confirmation
              setTimeout(() => removeMessage(message.id), 1000);
              return;
            }
          } else {
            addLog(`消息 (ID: ${message.id.substring(0, 4)}...) 目的节点 '${message.destination_node_name}' 在目标集群中不存在，已丢弃.`);
            updateMessage(message.id, { status: 'dropped', trace_route: nextTraceRoute });
            setTimeout(() => removeMessage(message.id), 1000);
            return;
          }
        } else {
          // Target in remote cluster
          if (currentNode.is_gateway) {
            const routeEntry = currentNode.inter_cluster_routing_table[message.destination_cluster_uuid];
            if (routeEntry) {
              const nextHopGateway = Object.values(nodes).find(
                (n) => n.node_name === routeEntry.next_hop_node_name && n.cluster_uuid === routeEntry.next_hop_cluster_uuid
              );
              if (nextHopGateway) {
                nextNodeId = nextHopGateway.id;
              } else {
                addLog(`消息 (ID: ${message.id.substring(0, 4)}...) 网关 '${currentNode.node_name}' 无法找到下一跳网关，已丢弃.`);
                updateMessage(message.id, { status: 'dropped', trace_route: nextTraceRoute });
                setTimeout(() => removeMessage(message.id), 1000);
                return;
              }
            } else {
              addLog(`消息 (ID: ${message.id.substring(0, 4)}...) 网关 '${currentNode.node_name}' 无法找到目的集群路由，已丢弃.`);
              updateMessage(message.id, { status: 'dropped', trace_route: nextTraceRoute });
              setTimeout(() => removeMessage(message.id), 1000);
              return;
            }
          } else {
            // Standard node, forward to local gateway
            const localGatewayNames = Object.keys(currentNode.local_gateways);
            if (localGatewayNames.length > 0) {
              const chosenGatewayName = localGatewayNames[Math.floor(Math.random() * localGatewayNames.length)]; // Simple random choice
              const chosenGateway = Object.values(nodes).find(
                (n) => n.node_name === chosenGatewayName && n.cluster_uuid === currentNode.cluster_uuid
              );
              if (chosenGateway) {
                nextNodeId = chosenGateway.id;
                addLog(`消息 (ID: ${message.id.substring(0, 4)}...) 普通节点 '${currentNode.node_name}' 转发至本地网关 '${chosenGateway.node_name}'.`);
              } else {
                addLog(`消息 (ID: ${message.id.substring(0, 4)}...) 普通节点 '${currentNode.node_name}' 无法找到本地网关，已丢弃.`);
                updateMessage(message.id, { status: 'dropped', trace_route: nextTraceRoute });
                setTimeout(() => removeMessage(message.id), 1000);
                return;
              }
            } else {
              addLog(`消息 (ID: ${message.id.substring(0, 4)}...) 普通节点 '${currentNode.node_name}' 没有发现本地网关，已丢弃.`);
              updateMessage(message.id, { status: 'dropped', trace_route: nextTraceRoute });
              setTimeout(() => removeMessage(message.id), 1000);
              return;
            }
          }
        }

        if (nextNodeId) {
          const nextNode = nodes[nextNodeId];
          if (nextNode) {
            updateMessage(message.id, {
              current_node_id: nextNodeId,
              position: { ...nextNode.position }, // Snap to next node for simplicity
              ttl: message.ttl - 1,
              trace_route: nextTraceRoute,
            });
            addLog(`消息 (ID: ${message.id.substring(0, 4)}...) 从 '${currentNode.node_name}' 路由到 '${nextNode.node_name}'. TTL: ${message.ttl - 1}`);
          }
        }
      });
    }, simulationSpeed);

    return () => clearInterval(interval);
  }, [isSimulationRunning, simulationSpeed, nodes, clusters, gatewayConnections, messages, addLog, updateNode, updateMessage, removeMessage]);

  // Derived state for easy access
  const allGatewayNodes = Object.values(nodes).filter(node => node.is_gateway);
  const allNodes = Object.values(nodes);

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-inter">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-purple-700 text-white p-4 shadow-lg rounded-b-xl">
        <h1 className="text-3xl font-bold text-center">两层路由系统模拟器</h1>
        <p className="text-center text-sm mt-1 opacity-90">验证跨集群通信方案的可行性</p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Control Panel */}
        <div className="w-1/4 bg-white p-6 border-r border-gray-200 overflow-y-auto shadow-md">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">控制面板</h2>

          {/* Simulation Controls */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg shadow-sm">
            <h3 className="text-lg font-medium mb-2 text-blue-700">模拟控制</h3>
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={toggleSimulation}
                className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all duration-200 ${
                  isSimulationRunning
                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-md'
                    : 'bg-green-500 hover:bg-green-600 text-white shadow-md'
                }`}
              >
                {isSimulationRunning ? '暂停模拟' : '开始模拟'}
              </button>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">模拟速度 (ms/tick): {simulationSpeed}</label>
            <input
              type="range"
              min="100"
              max="2000"
              step="100"
              value={simulationSpeed}
              onChange={(e) => setSimulationSpeed(Number(e.target.value))}
              className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Cluster Management */}
          <div className="mb-6 p-4 bg-purple-50 rounded-lg shadow-sm">
            <h3 className="text-lg font-medium mb-2 text-purple-700">集群管理</h3>
            <div className="flex mb-2">
              <input
                type="text"
                placeholder="新集群名称"
                value={newClusterName}
                onChange={(e) => setNewClusterName(e.target.value)}
                className="flex-1 p-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
              <button
                onClick={() => {
                  if (newClusterName) {
                    addCluster(newClusterName);
                    setNewClusterName('');
                  }
                }}
                className="bg-purple-500 hover:bg-purple-600 text-white py-2 px-4 rounded-r-lg font-semibold shadow-md"
              >
                添加集群
              </button>
            </div>
            <select
              onChange={(e) => removeCluster(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
              defaultValue=""
            >
              <option value="" disabled>选择集群以移除</option>
              {clusters.map((c) => (
                <option key={c.uuid} value={c.uuid}>
                  {c.name} (ID: {c.uuid.substring(0, 4)}...)
                </option>
              ))}
            </select>
          </div>

          {/* Node Management */}
          <div className="mb-6 p-4 bg-green-50 rounded-lg shadow-sm">
            <h3 className="text-lg font-medium mb-2 text-green-700">节点管理</h3>
            <div className="mb-2">
              <input
                type="text"
                placeholder="节点名称"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              <select
                value={newNodeCluster}
                onChange={(e) => setNewNodeCluster(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg mb-2 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="" disabled>选择集群</option>
                {clusters.map((c) => (
                  <option key={c.uuid} value={c.uuid}>
                    {c.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center mb-3 text-gray-700">
                <input
                  type="checkbox"
                  checked={newNodeIsGateway}
                  onChange={(e) => setNewNodeIsGateway(e.target.checked)}
                  className="mr-2 h-4 w-4 text-green-600 rounded focus:ring-green-500"
                />
                是网关节点
              </label>
              <button
                onClick={() => {
                  if (newNodeName && newNodeCluster) {
                    addNode(newNodeCluster, newNodeName, newNodeIsGateway);
                    setNewNodeName('');
                    setNewNodeCluster('');
                    setNewNodeIsGateway(false);
                  }
                }}
                className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg w-full font-semibold shadow-md"
              >
                添加节点
              </button>
            </div>
            <select
              onChange={(e) => removeNode(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              defaultValue=""
            >
              <option value="" disabled>选择节点以移除</option>
              {Object.values(nodes).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.node_name} ({clusters.find(c => c.uuid === n.cluster_uuid)?.name}) {n.is_gateway ? '[网关]' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Gateway Connection */}
          <div className="mb-6 p-4 bg-yellow-50 rounded-lg shadow-sm">
            <h3 className="text-lg font-medium mb-2 text-yellow-700">网关连接</h3>
            <select
              value={connectGw1}
              onChange={(e) => setConnectGw1(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg mb-2 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <option value="" disabled>选择网关 1</option>
              {allGatewayNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.node_name} ({clusters.find(c => c.uuid === n.cluster_uuid)?.name})
                </option>
              ))}
            </select>
            <select
              value={connectGw2}
              onChange={(e) => setConnectGw2(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg mb-2 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <option value="" disabled>选择网关 2</option>
              {allGatewayNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.node_name} ({clusters.find(c => c.uuid === n.cluster_uuid)?.name})
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                if (connectGw1 && connectGw2) {
                  connectGateways(connectGw1, connectGw2);
                  setConnectGw1('');
                  setConnectGw2('');
                }
              }}
              className="bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-4 rounded-lg w-full font-semibold shadow-md mb-2"
            >
              连接网关
            </button>
            <select
              onChange={(e) => disconnectGateways(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              defaultValue=""
            >
              <option value="" disabled>选择连接以断开</option>
              {gatewayConnections.map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {nodes[conn.gateway1_id]?.node_name} &lt;-&gt; {nodes[conn.gateway2_id]?.node_name}
                </option>
              ))}
            </select>
          </div>

          {/* Send Message */}
          <div className="mb-6 p-4 bg-red-50 rounded-lg shadow-sm">
            <h3 className="text-lg font-medium mb-2 text-red-700">发送消息</h3>
            <select
              value={sendSourceCluster}
              onChange={(e) => {
                setSendSourceCluster(e.target.value);
                setSendSourceNode(''); // Reset node selection
              }}
              className="w-full p-2 border border-gray-300 rounded-lg mb-2 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <option value="" disabled>源集群</option>
              {clusters.map((c) => (
                <option key={c.uuid} value={c.uuid}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={sendSourceNode}
              onChange={(e) => setSendSourceNode(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg mb-2 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <option value="" disabled>源节点</option>
              {Object.values(nodes)
                .filter((n) => n.cluster_uuid === sendSourceCluster)
                .map((n) => (
                  <option key={n.id} value={n.node_name}>
                    {n.node_name} {n.is_gateway ? '[网关]' : ''}
                  </option>
                ))}
            </select>
            <select
              value={sendDestCluster}
              onChange={(e) => {
                setSendDestCluster(e.target.value);
                setSendDestNode(''); // Reset node selection
              }}
              className="w-full p-2 border border-gray-300 rounded-lg mb-2 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <option value="" disabled>目的集群</option>
              {clusters.map((c) => (
                <option key={c.uuid} value={c.uuid}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={sendDestNode}
              onChange={(e) => setSendDestNode(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg mb-2 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <option value="" disabled>目的节点</option>
              {Object.values(nodes)
                .filter((n) => n.cluster_uuid === sendDestCluster)
                .map((n) => (
                  <option key={n.id} value={n.node_name}>
                    {n.node_name} {n.is_gateway ? '[网关]' : ''}
                  </option>
                ))}
            </select>
            <input
              type="text"
              placeholder="消息内容 (Payload)"
              value={sendPayload}
              onChange={(e) => setSendPayload(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <button
              onClick={() => {
                if (sendSourceCluster && sendSourceNode && sendDestCluster && sendDestNode) {
                  sendMessage(sendSourceCluster, sendSourceNode, sendDestCluster, sendDestNode, sendPayload || 'Hello');
                  setSendPayload('');
                }
              }}
              className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg w-full font-semibold shadow-md"
            >
              发送消息
            </button>
          </div>
        </div>

        {/* Visualization Area */}
        <div className="flex-1 relative bg-gray-200 overflow-hidden rounded-bl-xl">
          <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none">
            {/* Gateway Connections */}
            {gatewayConnections.map((conn) => {
              const gw1Pos = getNodePosition(nodes[conn.gateway1_id], nodes);
              const gw2Pos = getNodePosition(nodes[conn.gateway2_id], nodes);
              if (!gw1Pos || !gw2Pos) return null;
              return (
                <line
                  key={conn.id}
                  x1={gw1Pos.x}
                  y1={gw1Pos.y}
                  x2={gw2Pos.x}
                  y2={gw2Pos.y}
                  stroke="#8B5CF6" // Purple for gateway connections
                  strokeWidth="3"
                  strokeDasharray="5,5"
                  className="pointer-events-auto cursor-pointer hover:stroke-purple-800"
                  onClick={() => disconnectGateways(conn.id)}
                >
                  <title>点击断开连接: {nodes[conn.gateway1_id]?.node_name} &lt;-&gt; {nodes[conn.gateway2_id]?.node_name}</title>
                </line>
              );
            })}
          </svg>

          {/* Clusters */}
          {clusters.map((cluster) => (
            <div
              key={cluster.uuid}
              className="absolute bg-blue-100 border-2 border-blue-400 rounded-xl shadow-lg flex flex-col p-4 items-start justify-start"
              style={{
                left: cluster.position.x,
                top: cluster.position.y,
                width: cluster.size.width,
                height: cluster.size.height,
              }}
              onMouseDown={(e) => handleMouseDown(e, 'cluster', cluster.uuid)}
            >
              <h3 className="text-lg font-bold text-blue-800 mb-2">
                {cluster.name} <span className="text-sm font-normal text-blue-600">(ID: {cluster.uuid.substring(0, 4)}...)</span>
              </h3>
            </div>
          ))}

          {/* Nodes */}
          {Object.values(nodes).map((node) => {
            const cluster = clusters.find(c => c.uuid === node.cluster_uuid);
            if (!cluster) return null; // Node's cluster might have been removed

            return (
              <div
                key={node.id}
                className={`absolute w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shadow-md cursor-grab active:cursor-grabbing
                  ${node.is_gateway ? 'bg-purple-600 border-2 border-purple-800' : 'bg-green-600 border-2 border-green-800'}`}
                style={{
                  left: node.position.x,
                  top: node.position.y,
                }}
                onMouseDown={(e) => handleMouseDown(e, 'node', node.id)}
                onClick={() => setSelectedNodeId(node.id)} // Add onClick to select node
              >
                {node.node_name.substring(0, 3)}
                {/* Node Info Popover (Optional, for detailed info on hover) */}
                {/* This popover is now replaced by the modal for routing table */}
              </div>
            );
          })}

          {/* Messages */}
          {messages.map((message) => {
            const currentNode = nodes[message.current_node_id];
            if (!currentNode) return null; // Message's current node might have been removed

            return (
              <div
                key={message.id}
                className="absolute w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold shadow-lg animate-pulse"
                style={{
                  left: currentNode.position.x + 8, // Center on node
                  top: currentNode.position.y + 8,
                  transition: `all ${simulationSpeed / 2}ms linear`, // Smooth movement
                }}
              >
                {message.ttl}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 p-1 bg-gray-800 text-white text-[10px] rounded-md whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <p>源: {message.source_node_name}@{clusters.find(c => c.uuid === message.source_cluster_uuid)?.name}</p>
                  <p>目的: {message.destination_node_name}@{clusters.find(c => c.uuid === message.destination_cluster_uuid)?.name}</p>
                  <p>内容: {message.payload}</p>
                  <p>路径: {message.trace_route.join(' -> ')}</p>
                </div>
              </div>
            );
          })}

          {/* Node Details Modal */}
          {selectedNode && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg shadow-xl border-2 border-blue-500 z-50 w-96">
              <h3 className="text-xl font-bold mb-3 text-blue-800">节点详情</h3>
              <p className="mb-1"><strong>名称:</strong> {selectedNode.node_name}</p>
              <p className="mb-1"><strong>集群:</strong> {clusters.find(c => c.uuid === selectedNode.cluster_uuid)?.name}</p>
              <p className="mb-3"><strong>类型:</strong> {selectedNode.is_gateway ? '网关节点' : '普通节点'}</p>

              {selectedNode.is_gateway && (
                <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                  <h4 className="font-bold text-gray-700 mb-2">集群间路由表:</h4>
                  {Object.keys(selectedNode.inter_cluster_routing_table).length > 0 ? (
                    <ul className="list-disc list-inside text-sm text-gray-600">
                      {Object.entries(selectedNode.inter_cluster_routing_table).map(([destUuid, entry]) => (
                        <li key={destUuid}>
                          到 <strong>{clusters.find(c => c.uuid === destUuid)?.name || destUuid.substring(0,4)}</strong>: 
                          下一跳 <strong>{entry.next_hop_node_name}</strong> (在 {clusters.find(c => c.uuid === entry.next_hop_cluster_uuid)?.name || entry.next_hop_cluster_uuid.substring(0,4)}), 
                          成本 <strong>{entry.cost}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-600">无路由条目。</p>
                  )}
                </div>
              )}

              {!selectedNode.is_gateway && (
                <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                  <h4 className="font-bold text-gray-700 mb-2">已发现的本地网关:</h4>
                  {Object.keys(selectedNode.local_gateways).length > 0 ? (
                    <ul className="list-disc list-inside text-sm text-gray-600">
                      {Object.keys(selectedNode.local_gateways).map((gwName) => (
                        <li key={gwName}>
                          {gwName} (最后心跳: {new Date(selectedNode.local_gateways[gwName]).toLocaleTimeString()})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-600">无本地网关。</p>
                  )}
                </div>
              )}

              <button
                onClick={() => setSelectedNodeId(null)}
                className="mt-4 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg w-full font-semibold shadow-md"
              >
                关闭
              </button>
            </div>
          )}
        </div>

        {/* Log Viewer */}
        <div className="w-1/4 bg-gray-800 p-6 text-white overflow-y-auto shadow-md rounded-br-xl">
          <h2 className="text-2xl font-semibold mb-4 text-gray-100">模拟日志</h2>
          <div className="font-mono text-sm space-y-1">
            {logs.map((log, index) => (
              <p key={index} className="break-words text-gray-300">
                {log}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
