terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.20"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.10"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "~> 3.20"
    }
  }

  backend "s3" {
    bucket = "fintech-platform-terraform-state"
    key    = "production/terraform.tfstate"
    region = var.aws_region
    encrypt = true
    dynamodb_table = "fintech-platform-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "fintech-payment-platform"
      Environment = var.environment
      ManagedBy   = "terraform"
      Owner       = "platform-team"
    }
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}

# Random resources for unique naming
resource "random_pet" "cluster_name" {
  length = 2
  prefix = "fintech"
}

resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# VPC Configuration
module "vpc" {
  source = "./modules/vpc"
  
  environment = var.environment
  vpc_cidr    = var.vpc_cidr
  
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  database_subnet_cidrs = var.database_subnet_cidrs
  
  availability_zones = var.availability_zones
  
  enable_nat_gateway = true
  enable_vpn_gateway = false
  
  tags = {
    Name = "${var.environment}-fintech-vpc"
  }
}

# EKS Cluster
module "eks" {
  source = "./modules/eks"
  
  cluster_name    = random_pet.cluster_name.id
  cluster_version = var.kubernetes_version
  
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids
  
  node_groups = {
    application_nodes = {
      desired_capacity = 3
      max_capacity     = 10
      min_capacity     = 3
      
      instance_types = ["m5.large", "m5a.large", "m5n.large"]
      
      k8s_labels = {
        node-type = "application"
        workload  = "payment-processing"
      }
      
      taints = {
        dedicated = {
          key    = "application"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      }
    }
    
    system_nodes = {
      desired_capacity = 2
      max_capacity     = 4
      min_capacity     = 2
      
      instance_types = ["t3.medium"]
      
      k8s_labels = {
        node-type = "system"
        workload  = "infrastructure"
      }
    }
    
    database_nodes = {
      desired_capacity = 1
      max_capacity     = 3
      min_capacity     = 1
      
      instance_types = ["r5.large", "r5a.large"]
      
      k8s_labels = {
        node-type = "database"
        workload  = "data-storage"
      }
      
      taints = {
        database = {
          key    = "database"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      }
    }
  }
  
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
  }
  
  cluster_endpoint_public_access = true
  cluster_endpoint_private_access = true
  
  tags = {
    Name = "${var.environment}-fintech-eks"
  }
}

# RDS Databases
module "payment_database" {
  source = "./modules/rds"
  
  identifier = "${var.environment}-payment-db"
  
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.r5.large"
  
  allocated_storage     = 100
  max_allocated_storage  = 1000
  storage_type          = "gp3"
  storage_encrypted     = true
  
  db_name  = "payment_service"
  username = "payment_user"
  
  vpc_security_group_ids = [module.security_groups.rds_security_group_id]
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.environment}-payment-db-final-snapshot"
  
  tags = {
    Name = "${var.environment}-payment-database"
  }
}

module "wallet_database" {
  source = "./modules/rds"
  
  identifier = "${var.environment}-wallet-db"
  
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.r5.large"
  
  allocated_storage     = 100
  max_allocated_storage  = 1000
  storage_type          = "gp3"
  storage_encrypted     = true
  
  db_name  = "wallet_service"
  username = "wallet_user"
  
  vpc_security_group_ids = [module.security_groups.rds_security_group_id]
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.environment}-wallet-db-final-snapshot"
  
  tags = {
    Name = "${var.environment}-wallet-database"
  }
}

# ElastiCache Redis
module "redis_cluster" {
  source = "./modules/elasticache"
  
  cluster_id = "${var.environment}-fintech-redis"
  
  node_type = "cache.r6g.large"
  num_cache_nodes = 3
  
  parameter_group_name = "default.redis7"
  port = 6379
  
  subnet_group_name = module.vpc.redis_subnet_group_name
  security_group_ids = [module.security_groups.redis_security_group_id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth_token.result
  
  tags = {
    Name = "${var.environment}-fintech-redis"
  }
}

# EventStoreDB
module "eventstore" {
  source = "./modules/eventstore"
  
  cluster_name = "${var.environment}-fintech-eventstore"
  
  instance_type = "db.r5.large"
  
  vpc_id = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
  
  admin_password = random_password.eventstore_admin_password.result
  
  tags = {
    Name = "${var.environment}-fintech-eventstore"
  }
}

# S3 Buckets
module "s3_buckets" {
  source = "./modules/s3"
  
  environment = var.environment
  
  buckets = {
    ledger-backups = {
      versioning = true
      encryption = true
      lifecycle_rules = [
        {
          id     = "standard_ia_transition"
          status = "Enabled"
          transitions = [
            {
              days          = 30
              storage_class = "STANDARD_IA"
            },
            {
              days          = 90
              storage_class = "GLACIER"
            },
            {
              days          = 365
              storage_class = "DEEP_ARCHIVE"
            }
          ]
        }
      ]
    }
    
    audit-logs = {
      versioning = true
      encryption = true
      lifecycle_rules = [
        {
          id     = "log_retention"
          status = "Enabled"
          expiration = {
            days = 2555  # 7 years for compliance
          }
        }
      ]
    }
    
    payment-documents = {
      versioning = true
      encryption = true
    }
    
    terraform-state = {
      versioning = true
      encryption = true
    }
  }
}

# Security Groups
module "security_groups" {
  source = "./modules/security-groups"
  
  vpc_id = module.vpc.vpc_id
  
  environment = var.environment
}

# Application Load Balancers
module "alb" {
  source = "./modules/alb"
  
  name = "${var.environment}-fintech-alb"
  
  vpc_id           = module.vpc.vpc_id
  subnet_ids       = module.vpc.public_subnet_ids
  security_groups = [module.security_groups.alb_security_group_id]
  
  enable_deletion_protection = false
  
  tags = {
    Name = "${var.environment}-fintech-alb"
  }
}

# Route 53
module "route53" {
  source = "./modules/route53"
  
  domain_name = var.domain_name
  zone_id    = var.route53_zone_id
  
  alb_dns_name = module.alb.alb_dns_name
  alb_zone_id  = module.alb.alb_zone_id
  
  environment = var.environment
}

# Certificate Manager
module "acm" {
  source = "./modules/acm"
  
  domain_name = var.domain_name
  zone_id     = var.route53_zone_id
  
  environment = var.environment
}

# Monitoring
module "monitoring" {
  source = "./modules/monitoring"
  
  cluster_name = module.eks.cluster_name
  
  environment = var.environment
  
  depends_on = [module.eks]
}

# Secrets Management
resource "random_password" "redis_auth_token" {
  length  = 64
  special = false
}

resource "random_password" "eventstore_admin_password" {
  length  = 32
  special = true
}

resource "random_password" "database_passwords" {
  for_each = toset(["payment", "wallet"])
  
  length  = 32
  special = true
}

# Vault Integration
module "vault" {
  source = "./modules/vault"
  
  cluster_name = module.eks.cluster_name
  
  environment = var.environment
  
  depends_on = [module.eks]
}

# Outputs
output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "database_endpoints" {
  description = "Database endpoints"
  value = {
    payment = module.payment_database.db_instance_endpoint
    wallet  = module.wallet_database.db_instance_endpoint
  }
}

output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = module.redis_cluster.redis_cluster_address
}

output "alb_dns_name" {
  description = "Application Load Balancer DNS name"
  value       = module.alb.alb_dns_name
}

output "vault_endpoint" {
  description = "Vault endpoint"
  value       = module.vault.vault_endpoint
}
