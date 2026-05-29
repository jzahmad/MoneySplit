########################
# Variables used by RDS
########################

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

# (Optional) keep this if you want to also allow your laptop specifically.
variable "my_ip_cidr" {
  type        = string
  description = "Your public IP in CIDR form (x.x.x.x/32). Optional but recommended."
  default     = null
}

resource "aws_kms_key" "rds" {
  description         = "KMS key for RDS encryption"
  enable_key_rotation = true
}

########################
# Lambda SG (needed because your lambda.tf references it)
########################
resource "aws_security_group" "lambda_sg" {
  name        = "${var.app_name}-lambda-sg"
  description = "Lambda security group"
  vpc_id      = aws_vpc.main.id

  # No inbound required
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.app_name}-lambda-sg" }
}

########################
# RDS Security Group (DB is fully public)
########################
resource "aws_security_group" "rds_sg" {
  name        = "${var.app_name}-rds-sg"
  description = "Public RDS SG (TEMP - VERY UNSAFE)"
  vpc_id      = aws_vpc.main.id

  # ✅ FULLY PUBLIC (as you asked)
  ingress {
    from_port   = 3306
    to_port     = 3306
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    # security_groups = [aws_security_group.lambda_sg.id] after migration
  }


  # ✅ Ensure Lambda can connect even if you later tighten public rule
  ingress {
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_sg.id]
  }

  # Optional: allow ONLY your IP in addition to the public rule (not needed if 0.0.0.0/0 exists)
  dynamic "ingress" {
    for_each = var.my_ip_cidr == null ? [] : [var.my_ip_cidr]
    content {
      from_port   = 3306
      to_port     = 3306
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.app_name}-rds-sg" }
}

########################
# DB Subnet Group
########################
resource "aws_db_subnet_group" "rds_public" {
  name       = "${var.app_name}-rds-public-subnets"
  subnet_ids = aws_subnet.public[*].id
  # subnet_ids = aws_subnet.private[*].id should be after migration

  tags = { Name = "${var.app_name}-rds-public" }
}

########################
# RDS Instance (PUBLIC)
########################
resource "aws_db_instance" "mysql" {
  identifier = "${var.app_name}-mysql"

  engine         = "mysql"
  engine_version = "8.0"

  instance_class    = var.db_instance_class
  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 3306

  publicly_accessible    = false
  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  db_subnet_group_name   = aws_db_subnet_group.rds_public.name
  # db_subnet_group_name   = aws_db_subnet_group.rds_private.name should be private

  skip_final_snapshot = true
  deletion_protection = false

   # Enable automated backups
  backup_retention_period = 7  # days
  backup_window           = "03:00-04:00"

  # Enable Multi-AZ for high availability
  # multi_az               = true

  # Enable encryption at rest
  storage_encrypted      = true
  kms_key_id            = aws_kms_key.rds.arn


  tags = { Name = "${var.app_name}-mysql" }
}
