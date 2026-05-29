data "aws_availability_zones" "available" {}

variable "db_engine_version" {
  type    = string
  default = "8.0"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

resource "aws_security_group" "rds_sg" {
  name        = "${var.app_name}-rds-sg"
  description = "RDS security group"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.app_name}-rds-sg" }
}

resource "aws_db_subnet_group" "rds" {
  name       = "${var.app_name}-rds-subnets"
  subnet_ids = concat(
    aws_subnet.private[*].id,
    aws_subnet.public[*].id  # temp for mig
  )
  tags       = { Name = "${var.app_name}-rds-subnets" }
}

resource "aws_db_instance" "mysql" {
  identifier = "${var.app_name}-mysql"

  engine = "mysql"

  instance_class    = var.db_instance_class
  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 3306

  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  db_subnet_group_name   = aws_db_subnet_group.rds.name

  publicly_accessible = true #for mig
  skip_final_snapshot = true

  tags = { Name = "${var.app_name}-mysql" }
}
