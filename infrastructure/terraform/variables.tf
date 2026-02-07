variable "environment" {
  description = "Environment name (e.g., staging, production)"
  type        = string
  default     = "production"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "kubernetes_version" {
  description = "Kubernetes version for EKS cluster"
  type        = string
  default     = "1.28"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for database subnets"
  type        = list(string)
  default     = ["10.0.21.0/24", "10.0.22.0/24", "10.0.23.0/24"]
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "api.fintech-platform.com"
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID"
  type        = string
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default = {
    Project     = "fintech-payment-platform"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

# Database Configuration
variable "database_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r5.large"
}

variable "database_allocated_storage" {
  description = "Initial allocated storage for databases (GB)"
  type        = number
  default     = 100
}

variable "database_max_allocated_storage" {
  description = "Maximum allocated storage for databases (GB)"
  type        = number
  default     = 1000
}

variable "database_backup_retention_period" {
  description = "Backup retention period for databases (days)"
  type        = number
  default     = 7
}

# Redis Configuration
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.r6g.large"
}

variable "redis_num_cache_nodes" {
  description = "Number of Redis cache nodes"
  type        = number
  default     = 3
}

# EKS Configuration
variable "eks_cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = ""
}

variable "eks_node_group_desired_size" {
  description = "Desired size of EKS node groups"
  type        = number
  default     = 3
}

variable "eks_node_group_max_size" {
  description = "Maximum size of EKS node groups"
  type        = number
  default     = 10
}

variable "eks_node_group_min_size" {
  description = "Minimum size of EKS node groups"
  type        = number
  default     = 3
}

# Monitoring Configuration
variable "enable_monitoring" {
  description = "Enable monitoring and alerting"
  type        = bool
  default     = true
}

variable "enable_cloudwatch_container_insights" {
  description = "Enable CloudWatch Container Insights"
  type        = bool
  default     = true
}

# Security Configuration
variable "enable_encryption_at_rest" {
  description = "Enable encryption at rest for all storage"
  type        = bool
  default     = true
}

variable "enable_encryption_in_transit" {
  description = "Enable encryption in transit for all communications"
  type        = bool
  default     = true
}

variable "enable_private_networking" {
  description = "Enable private networking for resources"
  type        = bool
  default     = true
}

# Backup Configuration
variable "enable_cross_region_backup" {
  description = "Enable cross-region backup replication"
  type        = bool
  default     = true
}

variable "backup_region" {
  description = "Secondary region for backup replication"
  type        = string
  default     = "us-west-2"
}

# Cost Management
variable "enable_cost_allocation_tags" {
  description = "Enable cost allocation tags"
  type        = bool
  default     = true
}

variable "cost_center" {
  description = "Cost center for billing"
  type        = string
  default     = "engineering"
}

# Compliance Configuration
variable "enable_gdpr_compliance" {
  description = "Enable GDPR compliance features"
  type        = bool
  default     = true
}

variable "enable_pci_dss_compliance" {
  description = "Enable PCI-DSS compliance features"
  type        = bool
  default     = true
}

variable "data_retention_days" {
  description = "Data retention period in days"
  type        = number
  default     = 2555  # 7 years for financial compliance
}

# High Availability Configuration
variable "enable_multi_az" {
  description = "Enable multi-AZ deployment"
  type        = bool
  default     = true
}

variable "enable_disaster_recovery" {
  description = "Enable disaster recovery setup"
  type        = bool
  default     = true
}

# Performance Configuration
variable "enable_auto_scaling" {
  description = "Enable auto-scaling for resources"
  type        = bool
  default     = true
}

variable "enable_cdn" {
  description = "Enable CloudFront CDN"
  type        = bool
  default     = true
}

# Logging Configuration
variable "enable_detailed_monitoring" {
  description = "Enable detailed monitoring"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Log retention period in days"
  type        = number
  default     = 90
}

# Network Configuration
variable "enable_flow_logs" {
  description = "Enable VPC Flow Logs"
  type        = bool
  default     = true
}

variable "enable_dns_hostnames" {
  description = "Enable DNS hostnames in VPC"
  type        = bool
  default     = true
}

variable "enable_dns_support" {
  description = "Enable DNS support in VPC"
  type        = bool
  default     = true
}

# Application Configuration
variable "application_replicas" {
  description = "Number of application replicas"
  type        = number
  default     = 3
}

variable "application_cpu_limit" {
  description = "CPU limit for application pods"
  type        = string
  default     = "500m"
}

variable "application_memory_limit" {
  description = "Memory limit for application pods"
  type        = string
  default     = "512Mi"
}

variable "application_cpu_request" {
  description = "CPU request for application pods"
  type        = string
  default     = "250m"
}

variable "application_memory_request" {
  description = "Memory request for application pods"
  type        = string
  default     = "256Mi"
}

# Feature Flags
variable "enable_fraud_detection" {
  description = "Enable fraud detection features"
  type        = bool
  default     = true
}

variable "enable_real_time_monitoring" {
  description = "Enable real-time monitoring"
  type        = bool
  default     = true
}

variable "enable_advanced_analytics" {
  description = "Enable advanced analytics features"
  type        = bool
  default     = true
}

# Integration Configuration
variable "enable_external_apis" {
  description = "Enable external API integrations"
  type        = bool
  default     = true
}

variable "enable_webhooks" {
  description = "Enable webhook functionality"
  type        = bool
  default     = true
}

variable "enable_third_party_payments" {
  description = "Enable third-party payment processors"
  type        = bool
  default     = true
}

# Testing Configuration
variable "enable_load_testing" {
  description = "Enable load testing infrastructure"
  type        = bool
  default     = false
}

variable "enable_stress_testing" {
  description = "Enable stress testing capabilities"
  type        = bool
  default     = false
}

# Development Configuration
variable "enable_debug_mode" {
  description = "Enable debug mode for development"
  type        = bool
  default     = false
}

variable "enable_hot_reload" {
  description = "Enable hot reload for development"
  type        = bool
  default     = false
}
