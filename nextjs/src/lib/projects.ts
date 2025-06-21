// src/app/lib/projects.ts

export type Project = {
  name: string;
  description: string;
  logo: string;
  tech: string[];
  github: string;
  // new: per‑project gradient tailwind classes
  gradient: string;
};

export const projects: Project[] = [
  {
    name: 'AWS SaaS DevOps Webapp Template',
    description: `Fully automated DevOps template 
    for deploying a SaaS web application on AWS using Terraform, 
    GitHub Actions, and ECS. It includes a Next.js frontend and a 
    FastAPI backend with PostgreSQL (RDS), featuring a JWT-based 
    authentication system and a credit-based usage model. It uses 
    SQLAlchemy as an ORM to manipulate database data.`,
    logo: '/projects/saas.png',
    tech: [
      'ECS',
      'PostgreSQL',
      'NextJS',
      'NextAuth',
      'React',
      'Redux',
      'SQLAlchemy',
      'Docker',
      'FastAPI',
      'Terraform',
      'Hashicorp Cloud',
      'Decorator Pattern',
      'Repository Pattern',
    ],
    github: 'https://github.com/mfkimbell/aws-saas-webapp-template',
    gradient: 'from-orange-400 to-orange-600',
  },
  {
    name: 'WorkSync',
    description: `Built in 24 hours at UA Hackathon 2025, this project auto-provisions inventory and suggestion workflows on Google Cloud. Terraform and GitHub Actions deploy Cloud Run services, push container images to Artifact Registry, and manage secrets with Secret Manager. A FastAPI backend pairs with a zipped Next.js frontend served via Cloud Functions behind Firebase. Admins oversee requests, inventory, and costs on a dashboard, while users submit and track requests in real-time.`,
    logo: '/projects/worksync.png',
    tech: [
      'Hashicorp Cloud',
      'Terraform',
      'GitHub Actions',
      'Cloud Run',
      'Artifact Registry',
      'Cloud Functions',
      'Secrets Manager',
      'Firebase',
      'Next.js',
      'Redux',
      'SQLAlchemy',
      'CockroachDB',
    ],

    github: 'https://github.com/mfkimbell/ua-inn-2025',
    gradient: 'from-green-400 to-teal-500',
  },
  {
    name: 'Whisker',
    description:
      'Next.js webapp made to show off Twilio Segment and communication tools. Whisker is a direct‑to‑customer cat product sales company with a blog. It uses Twilio Verify to authenticate users with two‑factor authentication. It tracks user data on Twilio Segment and uses that data to target users with personalized ads, send messages via Twilio Conversations APO, and send emails through Twilio SendGrid. Advertisements update in real time based on the categories users view. Finally, it allows users to contact a live agent using Twilio Flex.',
    logo: '/projects/whisker.png',
    tech: [
      'Next.js',
      'Vercel',
      'Redux',
      'Twilio Verify',
      'Twilio SendGrid',
      'Twilio Conversations API',
      'Twilio Flex',
      'Twilio Segment',
      'Neon Postgres',
      'Prisma',
      'ShadCN',
      'TailwindCSS',
    ],

    github: 'https://github.com/mfkimbell/whisker',
    gradient: 'from-pink-500 to-rose-500',
  },
  {
    name: 'Spaceify',
    description:
      'Built in 24 hours for Auburn Hackathon 2024 Space Theme. React web app hosted on AWS EC2 that allows users to dynamically populate 3D renderings of playlists as a solar system. Song metadata determines factors like planet size, speed, and rotation. Users can click on planets to hear 30-second snippets of the song each planet represents. It employs computer vision via SciKit-Learn to map album art palettes to planet color gradients. It utilizes Docker to host the backend, frontend, and NGINX.',
    logo: '/projects/spaceify.png',
    tech: [
      'AWS EC2',
      'Docker',
      'NGINX',
      'React',
      'SciKit-Learn',
      'Computer Vision',
      'MultiThreading',
    ],
    github: 'https://github.com/uabhacks-at-auhacks24/frontend-in-space',
    gradient: 'from-green-400 to-green-500',
  },

  {
    name: 'AI Recruit Tracker',
    description:
      'Built in 24 hours at UA Hackathon 2025, this project auto-provisions inventory and suggestion workflows on Google Cloud. Terraform + GitHub Actions deploy Cloud Run services, push container images to Artifact Registry, and manage secrets with Secret Manager. A FastAPI backend pairs with a zipped Next.js frontend served via Cloud Functions behind Firebase. Admins manage requests, inventory, and costs on a dashboard, while users submit and track requests in real time.',
    logo: '/projects/recruit.png',
    tech: ['Docker', 'React', 'FastAPI', 'OpenAI', 'MongoDB'],
    github: 'https://github.com/mfkimbell/ai-recruit-tracker',
    gradient: 'from-violet-600 to-purple-700',
  },

  {
    name: 'AWS DevOps Pipeline',
    description:
      'An AWS CI/CD flow provisioned with Terraform: Ansible launches a Jenkins master-agent pair, runs code scans in SonarQube, and blocks the pipeline if quality gates fail. Once the code passes, the workflow builds a Docker image, pushes it to JFrog Artifactory, and rolls it out to Kubernetes for fault-tolerant, self-healing production.',
    logo: '/projects/devops2.png',
    tech: [
      'Terraform',
      'AWS EC2',
      'AWS EKS',
      'Jenkins',
      'SonarQube',
      'Ansible',
      'Docker',
      'Kubernetes',
      'JFrog Artifactory',
    ],
    github: 'https://github.com/mfkimbell/terraform-aws-DevOps',
    gradient: 'from-gray-700 to-gray-900',
  },
  {
    name: 'AWS SAM Serverless Zoo Manager',
    description:
      'Built in 10 hours for AWS GameDay Hackathon Regions 2024. A serverless AWS project using a full Serverless Application Model (SAM) template. It creates an API Gateway API for managing animal registry entries. A CloudWatch EventBridge bus rule triggers a Lambda function to automate animal feeding. Animal data is stored in DynamoDB, and processing workflows run in Step Functions using a Map state to invoke Lambdas in parallel.',
    logo: '/projects/zoo.png',
    tech: [
      'Serverless Application Model (SAM)',
      'API Gateway',
      'EventBridge Cron jobs',
      'Lambda',
      'DynamoDB',
      'Step Functions',
      'IAM',
    ],
    github: 'https://github.com/mfkimbell/aws-serverless-zoo-management',
    gradient: 'from-yellow-400 to-yellow-600',
  },
  {
    name: 'End-to-End DevOps Pipeline',
    description:
      'A simple web application deployed to production on AWS via an automated DevOps pipeline. Jenkins polls GitHub for code changes to the Tomcat‑hosted web app, then runs Ansible scripts to build new Docker images, push them to DockerHub, and deploy updated containers to Kubernetes clusters behind a load balancer.',
    logo: '/projects/devops.png',
    tech: [
      'AWS EC2',
      'AWS EKS',
      'Jenkins',
      'Tomcat',
      'Maven',
      'Ansible',
      'Docker',
      'Kubernetes',
    ],
    github: 'https://github.com/mfkimbell/end-to-end-DevOps',
    gradient: 'from-blue-500 to-blue-700',
  },
  {
    name: 'Serverless Django WebApp',
    description:
      'A Django web application using PostgreSQL for user data and AWS S3 for static file storage. The application is containerized with Docker and pushed to Amazon Elastic Container Registry (ECR). It is deployed on Amazon Elastic Container Service (ECS) with the Fargate serverless launch type, including HTTPS support and a custom domain.',
    logo: '/projects/fargate.png',
    tech: [
      'AWS CLI',
      'Boto3',
      'Certificate Manager',
      'Django',
      'Docker',
      'ECR',
      'ECS',
      'Fargate',
      'Gunicorn',
      'Postgres',
      'RDS',
      'Route53',
    ],
    github: 'https://github.com/mfkimbell/django-serverless-webapp',
    gradient: 'from-indigo-500 to-indigo-700',
  },
  {
    name: 'Catalog Web Scraper',
    description:
      'A Python web scraper for extracting book information from an online catalog using Xlml. It scrapes data asynchronously with Asyncio and RabbitMQ queues, stores results in PostgreSQL, and provides a Flask API for querying the database. The scraper supports retrieving additional book details beyond what the site directly provides. The entire project is containerized with Docker.',
    logo: '/projects/scrape.png',
    tech: [
      'Python',
      'Xlml',
      'Asyncio',
      'RabbitMQ',
      'PostgreSQL',
      'Flask',
      'Docker',
    ],
    github: 'https://github.com/mfkimbell/catalog-web-scraper',
    gradient: 'from-green-400 to-green-600',
  },

  {
    name: 'Kafka Stock Market Data Stream',
    description:
      'This project uses Jupyter Notebooks to produce messages to an Apache Kafka stream hosted on AWS MSK. Stock market API data is consumed by a Jupyter consumer and stored in S3. An AWS Glue crawler ingests the JSON files from S3 and transforms them into a data catalog for real‑time querying in AWS Athena.',
    logo: '/projects/kafka.png',
    tech: [
      'Kafka',
      'Jupyter Notebooks',
      'Pandas',
      'AWS MSK',
      'AWS EC2',
      'AWS Glue',
      'AWS S3',
    ],
    github: 'https://github.com/mfkimbell/aws-msk-kafka/tree/main',
    gradient: 'from-red-400 to-red-600',
  },
  {
    name: 'AI Histopathology Segmenter',
    description:
      'Performs semantic segmentation of skin patches in histopathology images using PyTorch and a U‑Net CNN. Tiled image patches are preprocessed and stored with PathML, then loaded into PyTorch DataLoader for training. Training is accelerated with NVIDIA CUDA Toolkit, and the pipeline runs in Docker for reproducibility. Once trained, the model segments new images and extracts target areas to enable AI‑assisted digital pathology.',
    logo: '/projects/skin.png',
    tech: [
      'PathML',
      'PyTorch',
      'Docker',
      'U‑Net',
      'Deep Learning',
      'Computer Vision',
      'NVIDIA CUDA Toolkit',
    ],
    github: 'https://github.com/Summit-Technology-Consulting/stratum-pathml',
    gradient: 'from-purple-400 to-purple-600',
  },
  {
    name: 'AI Marketing Agent',
    description:
      'A commissioned project accessible via an embeddable iframe. The React frontend is hosted on Firebase, and the FastAPI backend runs on Google Cloud Run. It communicates with OpenAI’s API to generate marketing content. On code changes, GitHub Actions builds a Docker image, pushes it to Google Artifact Registry, and Cloud Run pulls it. Secrets are managed in GitHub Secrets and Google Secrets Manager.',
    logo: '/projects/marketing.png',
    tech: [
      'GitHub Actions',
      'React',
      'Firebase',
      'Google Cloud',
      'Google Cloud Run',
      'Google Secrets Manager',
      'Google Artifact Registry',
      'OpenAI API',
      'Docker',
      'FastAPI',
    ],
    github: 'https://github.com/jaypyles/marketingviaai',
    gradient: 'from-orange-400 to-orange-600',
  },
  {
    name: 'AI Company Agent',
    description:
      'Demonstrates building a company AI agent using Amazon Bedrock and Claude 3 Sonnet to interpret user inputs and execute API operations via AWS Lambda. The agent uses semantic matching to map prompts to OpenAPI‑defined operations. Banking records are stored in DynamoDB, queried by the Bedrock agent with RAG‑powered similarity search against embeddings in an OpenSearch vector store, all backed by S3‑hosted PDF documents.',
    logo: '/projects/agent.png',
    tech: [
      'RAG',
      'Bedrock Agent',
      'Bedrock Knowledge Base',
      'Claude 3 Sonnet',
      'Lambda',
      'OpenAPI Schema',
    ],
    github: 'https://github.com/mfkimbell/ai-company-agent/tree/main',
    gradient: 'from-teal-400 to-teal-600',
  },
  {
    name: 'AI Chatbot',
    description:
      'Dockerized Python application providing a Streamlit UI for an AI chatbot. It uses Langchain and Anthropic’s Claude‑3‑Haiku LLM to maintain conversation memory and deliver contextually accurate responses.',
    logo: '/projects/chatbot.png',
    tech: ['Langchain', 'Bedrock', 'Claude 3 Haiku', 'Streamlit', 'Docker'],
    github: 'https://github.com/mfkimbell/ai-chatbot',
    gradient: 'from-blue-300 to-blue-500',
  },
  {
    name: 'AI RAG Document QA',
    description:
      'Dockerized Python app with a Streamlit UI for retrieval-augmented question answering over PDFs. Documents are chunked, embedded via AWS Bedrock’s Titan-Text, stored in FAISS, and queried through LangChain with Claude v2 providing answers.',
    logo: '/projects/rag.png',
    tech: [
      'LangChain',
      'Bedrock',
      'Titan Text',
      'Claude v2',
      'FAISS',
      'Streamlit',
      'Docker',
    ],
    github: 'https://github.com/mfkimbell/ai-rag-pdf',
    gradient: 'from-green-400 to-green-600',
  },
  {
    name: 'Cloud File Upload Service',
    description:
      'AWS-backed file-sharing platform: a Flask webserver lets users upload files, Lambda & SNS handle processing and email delivery of download links, and user data is stored in a MySQL RDS instance.',
    logo: '/projects/cloud.png',
    tech: ['AWS', 'Lambda', 'SNS', 'Flask', 'MySQL'],
    github: 'https://github.com/mfkimbell/cloud-file-upload-service',
    gradient: 'from-yellow-400 to-yellow-600',
  },
  {
    name: 'S3 Website Hosting Custom Action',
    description:
      'Suite of GitHub composite, JavaScript, and Docker actions that form a CI/CD pipeline to build and deploy a static website to Amazon S3 automatically on every commit.',
    logo: '/projects/actions2.png',
    tech: [
      'GitHub Actions',
      'Composite Actions',
      'JavaScript Actions',
      'Docker Actions',
      'AWS',
      'S3',
    ],
    github: 'https://github.com/mfkimbell/github-actions-custom-actions',
    gradient: 'from-purple-400 to-purple-600',
  },
  {
    name: 'React Movie Database GUI',
    description:
      'C#/.NET 6 + React front-end connected to Microsoft SQL Server via Entity Framework Core, enabling full CRUD operations on movie data with real-time GUI updates.',
    logo: '/projects/movie.png',
    tech: ['C#', 'React JS', 'SQL Server', '.NET 6', 'Entity Framework Core'],
    github: 'https://github.com/mfkimbell/react-movie-database',
    gradient: 'from-red-400 to-red-600',
  },
  {
    name: 'NLP Sentiment Analysis for SQL Database',
    description:
      'Python batch-processing pipeline that benchmarks HuggingFace Transformers and NLTK, then uses spaCy to calculate sentiment polarity for thousands of posts and write the results back to a PostgreSQL table.',
    logo: '/projects/sentiment.png',
    tech: ['Python', 'spaCy', 'HuggingFace', 'NLTK', 'PostgreSQL'],
    github: 'https://github.com/mfkimbell/reviews-nlp-sentiment-analysis',
    gradient: 'from-rose-400 to-rose-600',
  },
  {
    name: 'Golang GraphQL Server',
    description:
      'Lightweight GraphQL API built with Go and gqlgen, backed by MongoDB. Provides queries & mutations to create and list dogs, illustrating schema-first development and strongly-typed resolvers.',
    logo: '/projects/graphql.png',
    tech: ['Go', 'GraphQL', 'gqlgen', 'MongoDB'],
    github: 'https://github.com/mfkimbell/go-graphql-server',
    gradient: 'from-emerald-500 to-emerald-700',
  },
  {
    name: 'Agriculture Monitoring Drone',
    description:
      'JavaFX dashboard controlling a Tello drone for precision-agriculture demos. Implements flight commands via the Tello SDK, live telemetry, and map overlays to survey crop health as a team software-engineering capstone.',
    logo: '/projects/drone.png',
    tech: ['Java', 'JavaFX', 'Tello SDK'],
    github: 'https://github.com/mfkimbell/agricultural-monitoring-drone',
    gradient: 'from-lime-400 to-lime-600',
  },
  {
    name: 'GitHub Actions CI/CD Tutorial',
    description:
      'Hands-on tutorial repo showcasing composite, JavaScript, and Docker actions. Demonstrates automated issue replies and a full S3-deploy workflow while teaching students core GitHub Actions concepts.',
    logo: '/projects/actions.png',
    tech: ['GitHub Actions', 'CI/CD', 'Docker', 'JavaScript'],
    github: 'https://github.com/mfkimbell/github-actions-pipeline',
    gradient: 'from-violet-500 to-violet-700',
  },
  {
    name: 'Azure Blob / Container Manager',
    description:
      '.NET 8 WebApp for creating, listing, uploading, and deleting Azure Storage blobs & containers via the Azure SDK. Provides a clean C# MVC interface for cloud storage operations.',
    logo: '/projects/azure.png',
    tech: ['Azure', '.NET 8', 'C#', 'Blob Storage'],
    github: 'https://github.com/mfkimbell/azure-container-and-blob-management',
    gradient: 'from-sky-500 to-sky-700',
  },
  {
    name: 'AWS Amplify File-Sharing Dashboard',
    description:
      'React dashboard scaffolded with Amplify. Users sign in with Cognito, upload files to S3, and leave comments stored via GraphQL APIs in DynamoDB—all managed by Amplify’s cloud resources.',
    logo: '/projects/amplify.png',
    tech: ['Amplify', 'S3', 'Cognito', 'DynamoDB', 'React', 'GraphQL'],
    github: 'https://github.com/mfkimbell/aws-amplify-file-dashboard',
    gradient: 'from-orange-400 to-orange-600',
  },
  {
    name: 'Thrift Store E-Commerce Site',
    description:
      'Full-stack MERN storefront using JWT authentication and CryptoJS encryption. Express REST APIs drive product listings, cart management, and secure checkout against a MongoDB database.',
    logo: '/projects/thrift.png',
    tech: [
      'React',
      'Express',
      'MongoDB',
      'Mongoose',
      'JWT',
      'CryptoJS',
      'JavaScript',
    ],
    github: 'https://github.com/mfkimbell/ecommerce-thrift-website/tree/main',
    gradient: 'from-amber-500 to-amber-700',
  },

  {
    name: 'SongStitch',
    description:
      'React + FastAPI tool that calls the Spotify API, stitches selected album covers into a single wallpaper with Pillow, and lets users download custom mosaics sized for their phone.',
    logo: '/projects/stitch.png',
    tech: ['React', 'FastAPI', 'Pillow', 'Spotify API', 'Python'],
    github: 'https://github.com/mfkimbell/album-stitcher',
    gradient: 'from-teal-400 to-teal-600',
  },
  {
    name: 'Legends of Pygame',
    description:
      '2-D action-adventure game engine built from scratch with Pygame—sprites, collision detection, tile maps, animations, and camera tracking—all in Python.',
    logo: '/projects/zelda.png',
    tech: ['Python', 'Pygame'],
    github: 'https://github.com/mfkimbell/legends-of-pygame',
    gradient: 'from-green-700 to-green-900',
  },
  {
    name: 'Rust S-Notation Parser',
    description:
      'Recursive-descent parser in Rust that converts Polish-notation S-expressions into an abstract syntax tree supporting +, −, *, and ^ operators with arbitrary arity.',
    logo: '/projects/parse.png',
    tech: ['Rust', 'Parsing'],
    github: 'https://github.com/mfkimbell/rust-s-notation-parser',
    gradient: 'from-gray-500 to-gray-700',
  },

  {
    name: 'AI Image Generator',
    description:
      'Serverless Lambda (invoked via API Gateway) that calls AWS Bedrock to run Stable Diffusion. Generates an image, stores it in S3, and returns a presigned URL; also supports text-summarization tasks.',
    logo: '/projects/image.png',
    tech: ['API Gateway', 'Bedrock', 'Stable Diffusion', 'Lambda', 'S3'],
    github:
      'https://github.com/mfkimbell/aws-basic-ai-image-generation-and-text-summarization',
    gradient: 'from-fuchsia-500 to-fuchsia-700',
  },
  {
    name: 'Rust Quadtree Area Calculator',
    description:
      'Rust implementation of a QuadTree that recursively partitions space to compute the exact covered area of overlapping rectangles without double-counting.',
    logo: '/projects/quad.png',
    tech: ['Rust', 'Recursion'],
    github: 'https://github.com/mfkimbell/quad-tree-area-calculator',
    gradient: 'from-cyan-700 to-cyan-900',
  },

  {
    name: 'SQLAlchemy Postgres ORM',
    description:
      'Example project showing modern repository-pattern data access with SQLAlchemy, providing a full CRUD layer over a PostgreSQL movies table.',
    logo: '/projects/alchemy.png',
    tech: ['Python', 'SQLAlchemy', 'PostgreSQL', 'PDM'],
    github: 'https://github.com/mfkimbell/python-orm-setup',
    gradient: 'from-purple-600 to-purple-800',
  },
  {
    name: 'Personal Website',
    description:
      'My portfolio website built with NextJS and TailwindCSS. It keeps track of total page views, clicks, and mouse miles. It features a live canvas that users can draw on and update. It also features ThreeJS models that react to the user, tracking mouse movement and following the mouse.',
    logo: '/projects/website.png',
    tech: ['NextJS', 'ThreeJS', 'TailwindCSS', 'Vercel', 'Prisma'],
    github: 'https://github.com/mfkimbell/nextjs-portfolio',
    gradient: 'from-gray-700 to-gray-900',
  },
];
