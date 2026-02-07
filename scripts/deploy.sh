#!/bin/bash

# Deployment Script for Fintech Payment Platform
set -e

ENVIRONMENT=${1:-staging}
REGION=${2:-us-east-1}

echo "🚀 Deploying Fintech Payment Platform to $ENVIRONMENT in $REGION..."

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo "❌ Invalid environment. Use 'staging' or 'production'"
    exit 1
fi

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install AWS CLI first."
    exit 1
fi

# Check kubectl
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed. Please install kubectl first."
    exit 1
fi

# Check Terraform
if ! command -v terraform &> /dev/null; then
    echo "❌ Terraform is not installed. Please install Terraform first."
    exit 1
fi

# Set AWS region
export AWS_DEFAULT_REGION=$REGION

echo "🏗️ Step 1: Deploying infrastructure with Terraform..."

cd infrastructure/terraform

# Initialize Terraform
terraform init

# Plan deployment
terraform plan -var="environment=$ENVIRONMENT" -out=tfplan

# Apply infrastructure
echo "📦 Applying infrastructure changes..."
terraform apply tfplan

# Get cluster credentials
echo "🔑 Getting EKS cluster credentials..."
aws eks update-kubeconfig --region $REGION --name $(terraform output -raw cluster_name)

cd ../..

echo "🐳 Step 2: Building and pushing Docker images..."

# Build and push images for each service
services=("payment-service" "ledger-service" "wallet-service" "anti-fraud-service" "notification-service" "api-gateway")

for service in "${services[@]}"; do
    echo "📦 Building $service..."
    cd services/$service
    
    # Build Docker image
    docker build -t $service:latest .
    
    # Tag for ECR
    account_id=$(aws sts get-caller-identity --query Account --output text)
    ecr_registry="$account_id.dkr.ecr.$REGION.amazonaws.com"
    
    docker tag $service:latest $ecr_registry/$service:latest
    docker tag $service:latest $ecr_registry/$service:$(git rev-parse --short HEAD)
    
    # Push to ECR
    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ecr_registry
    docker push $ecr_registry/$service:latest
    docker push $ecr_registry/$service:$(git rev-parse --short HEAD)
    
    cd ../..
done

echo "⚙️ Step 3: Deploying to Kubernetes..."

# Apply namespaces
kubectl apply -f infrastructure/k8s/namespace.yaml

# Deploy services
for service in "${services[@]}"; do
    echo "🚀 Deploying $service..."
    
    # Update image in deployment files
    account_id=$(aws sts get-caller-identity --query Account --output text)
    ecr_registry="$account_id.dkr.ecr.$REGION.amazonaws.com"
    
    if [ -f "infrastructure/k8s/${service}-deployment.yaml" ]; then
        # Update image tag
        sed -i.bak "s|fintech-platform/$service:latest|$ecr_registry/$service:$(git rev-parse --short HEAD)|g" infrastructure/k8s/${service}-deployment.yaml
        
        # Apply deployment
        kubectl apply -f infrastructure/k8s/${service}-deployment.yaml -n fintech-platform-$ENVIRONMENT
        
        # Restore backup
        mv infrastructure/k8s/${service}-deployment.yaml.bak infrastructure/k8s/${service}-deployment.yaml
    fi
done

echo "🔍 Step 4: Verifying deployment..."

# Wait for deployments to be ready
kubectl wait --for=condition=available --timeout=300s deployment --all -n fintech-platform-$ENVIRONMENT

# Check pod status
echo "📊 Pod status:"
kubectl get pods -n fintech-platform-$ENVIRONMENT

# Get load balancer URL
echo "🌐 Getting Load Balancer URL..."
load_balancer_url=$(kubectl get svc api-gateway -n fintech-platform-$ENVIRONMENT -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

if [ -n "$load_balancer_url" ]; then
    echo "✅ Deployment completed successfully!"
    echo "🌐 Application URL: http://$load_balancer_url"
else
    echo "⚠️ Load balancer not ready yet. Check status with:"
    echo "kubectl get svc -n fintech-platform-$ENVIRONMENT"
fi

echo ""
echo "📊 Monitoring dashboards:"
echo "- Grafana: kubectl port-forward svc/grafana 3000:3000 -n fintech-platform-monitoring"
echo "- Prometheus: kubectl port-forward svc/prometheus 9090:9090 -n fintech-platform-monitoring"
echo "- Jaeger: kubectl port-forward svc/jaeger 16686:16686 -n fintech-platform-monitoring"

echo ""
echo "🔧 Useful commands:"
echo "- View logs: kubectl logs -f deployment/<service-name> -n fintech-platform-$ENVIRONMENT"
echo "- Scale service: kubectl scale deployment/<service-name> --replicas=3 -n fintech-platform-$ENVIRONMENT"
echo "- Get events: kubectl get events -n fintech-platform-$ENVIRONMENT --sort-by='.lastTimestamp'"
