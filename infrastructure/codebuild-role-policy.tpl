{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Resource": [
        "*"
      ],
      "Action": [
        "logs:*",
        "s3:*",
        "codebuild:*",
        "codepipeline:*",
        "cloudwatch:*",
        "cloudfront:*",
        "route53:*",
        "iam:*",
        "apigateway:*",
        "cloudformation:*",
        "lambda:*",
        "events:*",
        "ssm:DescribeParameters",
        "application-autoscaling:*",
        "states:*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": ${kms_key_arns}
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": ${ssm_parameter_arns}
    }
  ]
}
