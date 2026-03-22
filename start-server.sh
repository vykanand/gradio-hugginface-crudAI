#!/bin/bash

# Orchestration Server Startup Script
# Starts the orchestration server with Kafka/Zookeeper using existing docker-compose.yml

echo ""
echo "========================================"
echo "Orchestration Server Startup"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if Docker is running
echo -e "${YELLOW}Checking Docker...${NC}"
if ! docker ps > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Docker is not running${NC}"
    echo "Please start Docker and try again"
    read -p "Press Enter to exit"
    exit 1
fi
echo -e "${GREEN}[OK] Docker is running${NC}"

# Check docker-compose
echo -e "${YELLOW}Checking docker-compose...${NC}"
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}ERROR: docker-compose not found${NC}"
    echo "Please install docker-compose"
    read -p "Press Enter to exit"
    exit 1
fi
echo -e "${GREEN}[OK] docker-compose is available${NC}"

# Start services
echo ""
echo "========================================"
echo "Starting Services (Kafka, Zookeeper, App)"
echo "========================================"
echo ""

docker-compose up app

echo ""
echo "========================================"
echo "Services Stopped"
echo "========================================"
echo ""
read -p "Press Enter to exit"
