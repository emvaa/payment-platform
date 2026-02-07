# PowerShell Deployment Script for Fintech Payment Platform
param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("staging", "production")]
    [string]$Environment = "staging",
    
    [Parameter(Mandatory=$false)]
    [string]$Region = "us-east-1"
)

# Error handling
$ErrorActionPreference = "Stop"

Write-Host "🚀 Deploying Fintech Payment Platform to $Environment in $Region..." -ForegroundColor Green

# Check prerequisites
function Test-Prerequisites {
    Write-Host "🔍 Checking prerequisites..." -ForegroundColor Yellow
    
    $prerequisites = @{
        "aws" = "AWS CLI"
        "kubectl" = "kubectl"
        "terraform" = "Terraform"
        "docker" = "Docker"
    }
    
    foreach ($cmd in $prerequisites.Keys) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            Write-Host "❌ $($prerequisites[$cmd]) is not installed. Please install it first." -ForegroundColor Red
            exit 1
        }
    }
    
    Write-Host "✅ All prerequisites are installed." -ForegroundColor Green
}

# Set AWS region
$env:AWS_DEFAULT_REGION = $Region

# Step 1: Deploy infrastructure with Terraform
function Deploy-Infrastructure {
    Write-Host "🏗️ Step 1: Deploying infrastructure with Terraform..." -ForegroundColor Yellow
    
    Set-Location infrastructure/terraform
    
    # Initialize Terraform
    Write-Host "📦 Initializing Terraform..." -ForegroundColor Blue
    terraform init
    
    # Plan deployment
    Write-Host "📋 Planning deployment..." -ForegroundColor Blue
    terraform plan -var="environment=$Environment" -out=tfplan
    
    # Apply infrastructure
    Write-Host "📦 Applying infrastructure changes..." -ForegroundColor Blue
    terraform apply tfplan
    
    # Get cluster credentials
    Write-Host "🔑 Getting EKS cluster credentials..." -ForegroundColor Blue
    $clusterName = terraform output -raw cluster_name
    aws eks update-kubeconfig --region $Region --name $clusterName
    
    Set-Location ../..
}

# Step 2: Build and push Docker images
function Build-PushImages {
    Write-Host "🐳 Step 2: Building and pushing Docker images..." -ForegroundColor Yellow
    
    $services = @("payment-service", "ledger-service", "wallet-service", "anti-fraud-service", "notification-service", "api-gateway")
    
    # Get ECR registry
    $accountId = aws sts get-caller-identity --query Account --output text
    $ecrRegistry = "$accountId.dkr.ecs.$Region.amazonaws.com"
    
    foreach ($service in $services) {
        Write-Host "📦 Building $service..." -ForegroundColor Blue
        
        Set-Location services/$service
        
        # Build Docker image
        docker build -t $service:latest .
        
        # Tag for ECR
        $gitCommit = git rev-parse --short HEAD
        docker tag $service:latest "$ecrRegistry/$service:latest"
        docker tag $service:latest "$ecrRegistry/$service`:$gitCommit"
        
        # Push to ECR
        Write-Host "📤 Pushing to ECR..." -ForegroundColor Blue
        aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $ecrRegistry
        docker push "$ecrRegistry/$service:latest"
        docker push "$ecrRegistry/$service`:$gitCommit"
        
        Set-Location ../..
    }
}

# Step 3: Deploy to Kubernetes
function Deploy-Kubernetes {
    Write-Host "⚙️ Step 3: Deploying to Kubernetes..." -ForegroundColor Yellow
    
    # Apply namespaces
    Write-Host "📦 Applying namespaces..." -ForegroundColor Blue
    kubectl apply -f infrastructure/k8s/namespace.yaml
    
    # Deploy services
    $services = @("payment-service", "ledger-service", "wallet-service", "anti-fraud-service", "notification-service", "api-gateway")
    $namespace = "fintech-platform-$Environment"
    
    # Get ECR registry
    $accountId = aws sts get-caller-identity --query Account --output text
    $ecrRegistry = "$accountId.dkr.ecr.$Region.amazonaws.com"
    $gitCommit = git rev-parse --short HEAD
    
    foreach ($service in $services) {
        Write-Host "🚀 Deploying $service..." -ForegroundColor Blue
        
        $deploymentFile = "infrastructure/k8s/$service-deployment.yaml"
        
        if (Test-Path $deploymentFile) {
            # Update image tag
            $content = Get-Content $deploymentFile -Raw
            $content = $content -replace "fintech-platform/$service:latest", "$ecrRegistry/$service`:$gitCommit"
            $content | Out-File $deploymentFile -Encoding UTF8
            
            # Apply deployment
            kubectl apply -f $deploymentFile -n $namespace
            
            # Restore original file (if git is available)
            try {
                git checkout $deploymentFile
            } catch {
                Write-Host "⚠️ Could not restore original file. Make sure to commit your changes." -ForegroundColor Yellow
            }
        }
    }
}

# Step 4: Verify deployment
function Verify-Deployment {
    Write-Host "🔍 Step 4: Verifying deployment..." -ForegroundColor Yellow
    
    $namespace = "fintech-platform-$Environment"
    
    # Wait for deployments to be ready
    Write-Host "⏳ Waiting for deployments to be ready..." -ForegroundColor Blue
    kubectl wait --for=condition=available --timeout=300s deployment --all -n $namespace
    
    # Check pod status
    Write-Host "📊 Pod status:" -ForegroundColor Blue
    kubectl get pods -n $namespace
    
    # Get load balancer URL
    Write-Host "🌐 Getting Load Balancer URL..." -ForegroundColor Blue
    $loadBalancerUrl = kubectl get svc api-gateway -n $namespace -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
    
    if ($loadBalancerUrl) {
        Write-Host "✅ Deployment completed successfully!" -ForegroundColor Green
        Write-Host "🌐 Application URL: http://$loadBalancerUrl" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️ Load balancer not ready yet. Check status with:" -ForegroundColor Yellow
        Write-Host "kubectl get svc -n $namespace" -ForegroundColor Gray
    }
    
    # Display monitoring information
    Write-Host ""
    Write-Host "📊 Monitoring dashboards:" -ForegroundColor Blue
    Write-Host "- Grafana: kubectl port-forward svc/grafana 3000:3000 -n fintech-platform-monitoring" -ForegroundColor Gray
    Write-Host "- Prometheus: kubectl port-forward svc/prometheus 9090:9090 -n fintech-platform-monitoring" -ForegroundColor Gray
    Write-Host "- Jaeger: kubectl port-forward svc/jaeger 16686:16686 -n fintech-platform-monitoring" -ForegroundColor Gray
    
    # Display useful commands
    Write-Host ""
    Write-Host "🔧 Useful commands:" -ForegroundColor Blue
    Write-Host "- View logs: kubectl logs -f deployment/<service-name> -n $namespace" -ForegroundColor Gray
    Write-Host "- Scale service: kubectl scale deployment/<service-name> --replicas=3 -n $namespace" -ForegroundColor Gray
    Write-Host "- Get events: kubectl get events -n $namespace --sort-by='.lastTimestamp'" -ForegroundColor Gray
}

# Main execution
try {
    Test-Prerequisites
    Deploy-Infrastructure
    Build-PushImages
    Deploy-Kubernetes
    Verify-Deployment
    
    Write-Host ""
    Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
